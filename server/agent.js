// Agent-to-agent (A2A) read surface: an agent card, a two-tier status read,
// and a minimal JSON-RPC endpoint. Everything here is READ-ONLY by design —
// no handler in this file calls a store method that writes, and none may ever
// be added: this surface exists so another agent can *ask* how fueling is
// going, never so it can log, adjust, or configure anything. It is also
// non-medical, same framing as the rest of the app: it reports what was
// logged and what the plan said, never advice or diagnosis.
//
// Registration order matters twice in server/index.js (see the call site):
// these routes must be mounted BEFORE the requireAuth router (the card and
// the anonymous status tier must answer with no session) and before the SPA
// fallback (which would otherwise serve index.html for
// GET /.well-known/agent-card.json whenever dist/ exists).
//
// Shape follows the A2A protocol spec v0.3.0 (https://a2a-protocol.org):
// the card at /.well-known/agent-card.json, and JSON-RPC 2.0 at the card's
// `url` where `message/send` returns a Task object whose artifact parts carry
// the result. This implementation is deliberately stateless — no task store,
// no streaming, no push notifications — so `tasks/get` answers -32001
// (TaskNotFoundError) honestly instead of pretending to persistence it
// doesn't have.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { store, backend } from './db.js'
import { allProviderStatuses } from './providers.js'
import { usdaConfigured } from './lookup.js'
import { ocrConfigured } from './ocr.js'
import { ouraConfigured, oauthConfigured as ouraOAuthConfigured } from './integrations/oura.js'
import { garminConfigured } from './integrations/garmin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Version comes from package.json rather than a second hand-maintained
// constant that would drift the first time anyone bumped one and not the
// other. Read once at module load — the file can't change under a running
// process in any deployment shape this app has.
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

// The card's advertised base URL. Env-configurable because the card is read
// by OTHER agents who will call the URL it names — a card advertising
// localhost (or the wrong domain) is a card that reports success while
// pointing at nothing. Read per request, not at module load, so an operator
// can correct it with a restartless env change in dev and so tests can
// exercise both the set and unset branches.
function publicBaseUrl() {
  return (process.env.OMNIFUEL_PUBLIC_URL || 'https://omnifuelapp.tech').replace(/\/+$/, '')
}

// Bearer parse for THIS surface only. Same regex as index.js's
// presentedIngestToken, but deliberately NOT the x-ingest-token header: that
// header names the Apple pairing token, a different secret with a different
// audience, and accepting it here would quietly merge two trust domains.
function presentedAgentBearer(req) {
  const auth = req.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export function registerAgentRoutes(app, deps) {
  // These four are index.js's own implementations, injected rather than
  // reimplemented: day math (localYmd/dayRange — SERVER-local, the caveat is
  // restated where they're used), the intake reducer (sumIntake), and the
  // timing-safe token compare. agent.js is imported BY index.js, so importing
  // them back would be a cycle; copying them would be the drift this repo's
  // house rules exist to prevent (two implementations of "today" disagreeing
  // is a bug nobody would see until a figure was silently wrong).
  const { asyncH, localYmd, dayRange, sumIntake, timingSafeStringEqual } = deps

  // --- agent card -----------------------------------------------------------
  function agentCard() {
    const base = publicBaseUrl()
    return {
      protocolVersion: '0.3.0',
      name: 'OmniFuel Tech',
      description:
        'Read-only fueling status agent for a personal OmniFuel instance: reports service health and, with a bearer token, today\'s logged intake and plan-adjusted targets. Makes no medical, diagnostic, or injury claims and accepts no writes.',
      url: `${base}/a2a`,
      preferredTransport: 'JSONRPC',
      version: PKG.version,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json'],
      // The scheme is declared; the token value itself must never appear
      // anywhere in this card (asserted by test/agent-surface.test.js).
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Instance-operator token (OMNIFUEL_A2A_TOKEN) for the fueling-status skill.',
        },
      },
      skills: [
        {
          id: 'operational-status',
          name: 'Operational status',
          description:
            'Public service status: storage backend, which integrations are configured, server time. Config-level facts only — no personal data.',
          tags: ['status', 'public', 'read-only'],
          examples: ['Is OmniFuel up, and which integrations are configured?'],
          // `x-endpoint` is a namespaced extension, not an A2A field (A2A
          // readers ignore unknown properties). It exists so the test suite
          // can hold this card to the routes it advertises — a card whose
          // skills point at nothing would be this repo's signature failure
          // (reporting success while doing nothing), so every declared
          // endpoint is fetched and must answer.
          'x-endpoint': { method: 'GET', path: '/api/agent/status', auth: 'none' },
        },
        {
          id: 'fueling-status',
          name: 'Fueling status',
          description:
            "Today's fueling status for this instance's sole account: kcal logged, entries, last-log recency, baseline vs. plan-adjusted targets with adjustment factors, per-provider freshness, and an explicit demo flag. Requires the `bearer` security scheme. Read-only, non-medical.",
          tags: ['fueling', 'nutrition', 'read-only'],
          examples: ['How is fueling going today?'],
          security: [{ bearer: [] }],
          'x-endpoint': { method: 'GET', path: '/api/agent/status', auth: 'bearer' },
        },
      ],
    }
  }

  // --- the status body (shared by GET /api/agent/status and POST /a2a) ------
  // Per-user fueling status. Only ever called AFTER the bearer gate and the
  // sole-user resolution below — everything in here reads the store and
  // nothing else (no live provider API is ever called from this file;
  // allProviderStatuses is store-only apart from one getGarminDaily read).
  async function fuelingStatus(userId, now) {
    // SERVER-local day, via index.js's own localYmd/dayRange. Caveat: this is
    // the server's calendar, not the phone's — the same tradeoff
    // /api/today/summary already accepts for the watch. An agent caller has
    // no UTC-offset to send, so server-local is the honest default rather
    // than a guess at where the owner is standing.
    const date = localYmd(now)
    const { from, to } = dayRange(date)
    const entries = await store.listEntries(userId, { from, to })
    const kcalIn = Math.round(sumIntake(entries).calories)

    let lastLogAgeMinutes = null
    if (entries.length) {
      const newest = entries.reduce((max, e) => {
        const t = Date.parse(e.logged_at)
        return Number.isFinite(t) && t > max ? t : max
      }, -Infinity)
      // Clamped at 0: an entry logged with a slightly-future client timestamp
      // must not report a negative age.
      lastLogAgeMinutes = Number.isFinite(newest) ? Math.max(0, Math.round((now.getTime() - newest) / 60000)) : null
    }

    // The daily_plans snapshot written when the user viewed /api/today or
    // /api/plan/today — read back, never recomputed here: recomputing would
    // both duplicate the plan pipeline and (worse) report a plan the user was
    // never shown. Its absence is a fact worth reporting (plan_viewed_today),
    // not a gap to paper over.
    const snapshot = await store.getPlan(userId, date)
    const rationale = Array.isArray(snapshot?.rationale) ? snapshot.rationale : []

    // hasTargets is the only honest "the user actually set targets" signal —
    // getLatestTargets fabricates a 2000 kcal default when nothing was ever
    // set, and reporting that default as the user's target is a bug this app
    // has already fixed once. When targets were never set, the snapshot's
    // baseline/adjusted numbers are that same fabricated default laundered
    // through the plan pipeline, so they are withheld too, not just the live
    // read.
    let targets
    if (await store.hasTargets(userId)) {
      // Snapshot-first: when today's plan exists, its baseline is the number
      // the adjusted figure was actually derived from; the live
      // getLatestTargets read is only the fallback when no plan was viewed
      // today (safe here — the hasTargets gate above proved it's user-set).
      const baseline = snapshot?.baseline ?? (await store.getLatestTargets(userId))
      const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
      targets = {
        set: true,
        baseline_kcal: num(baseline?.calories),
        adjusted_kcal: snapshot ? num(snapshot.adjusted?.calories) : null,
        adjustments: { count: rationale.length, factors: rationale.map((r) => r.factor) },
      }
    } else {
      targets = { set: false }
    }

    // Per-provider status + freshness, narrowed to the four fields an agent
    // caller needs. The narrowing is deliberate: the full providerStatus rows
    // also carry Apple's HealthKit permission lists and Oura's classified
    // sync-error history — operator-debugging detail that belongs to the
    // signed-in Connections tab, not to a bearer whose only promise is
    // "fueling status".
    const statuses = await allProviderStatuses(store, userId, now)
    const providers = statuses.map((p) => ({
      id: p.id,
      status: p.status,
      demo: !!p.demo,
      last_synced_at: p.last_synced_at ?? null,
    }))

    return {
      available: true,
      date,
      kcal_in: kcalIn,
      entries_logged: entries.length,
      last_log_age_minutes: lastLogAgeMinutes,
      targets,
      plan_viewed_today: !!snapshot,
      // NOTE: no next_action field. The snapshot deliberately carries no
      // recommendation (savePlan persists baseline/adjusted/rationale/
      // signal_snapshot only — verified against both PgStore and JsonStore),
      // and recomputing one live here would be a second copy of /api/today's
      // recommendation logic that could disagree with what the user was
      // actually shown. Omitted rather than invented.
      //
      // Top-level demo is derived from the plan snapshot's rationale rows —
      // the one place seeded demo data (the canned "Evening Run" scenario)
      // can reach a FIGURE this surface reports (adjusted_kcal /
      // adjustments). Presenting that as real data is this repo's documented
      // failure mode, so any demo-driven adjustment marks the whole fueling
      // tier. kcal_in/entries are always real logs, and the provider rows
      // above carry their own per-row demo labels (demo-ALLOWED is true by
      // default for a never-connected provider, which says nothing about
      // today's figures — OR-ing it in here would flag real intake data as
      // demo on every fresh account, the same dishonesty in the other
      // direction).
      demo: rationale.some((r) => r.demo === true),
      providers,
    }
  }

  async function buildStatus(req) {
    const now = new Date()
    // The anonymous tier: config-level facts only, the same vocabulary as
    // GET /api/health. Nothing here is per-user — provider CONFIGURATION is a
    // fact about the server, but per-user connection state (e.g.
    // last_synced_at, which reveals when a person wears/syncs a device) is
    // not, so allProviderStatuses is bearer-tier only.
    const body = {
      ok: true,
      service: 'omnifuel',
      time: now.toISOString(),
      backend, // 'postgres' | 'json-file'
      providers: {
        ocr: ocrConfigured() ? 'configured' : 'not-configured',
        usda: usdaConfigured() ? 'configured' : 'not-configured',
        oura: ouraConfigured() ? 'legacy-token' : ouraOAuthConfigured() ? 'oauth' : 'not-configured',
        garmin: garminConfigured() ? 'oauth' : 'not-configured',
      },
      fueling: { available: false, reason: 'token required' },
    }

    // Read per request, matching APPLE_INGEST_TOKEN's precedent, so a token
    // rotation doesn't need a code change and tests can drive both branches.
    const configured = process.env.OMNIFUEL_A2A_TOKEN
    if (!configured) {
      // Unset means the fueling tier is off — permanently and visibly, even
      // when a caller presents a bearer. "not configured" (not an auth
      // error): there is no token a caller could ever present.
      body.fueling = { available: false, reason: 'not configured' }
      return body
    }

    const presented = presentedAgentBearer(req)
    // A wrong token must behave EXACTLY like an absent one — same body, same
    // reason, no distinct error text or status to probe against (the same
    // no-oracle rule the login route applies to unknown emails). The compare
    // is index.js's timingSafeStringEqual, so response latency doesn't leak
    // how many leading bytes of a guess were right either.
    if (!presented || !timingSafeStringEqual(presented, configured)) return body

    // Whose data? Same rule as the legacy Apple ingest token: a single shared
    // secret can only be attributed while there is exactly one account it
    // could mean. There is no owner/primary concept in this app — with zero
    // or two-plus users the honest answer is an explicit refusal, never a
    // guess.
    const userId = await store.getSoleUserId()
    if (userId == null) {
      body.fueling = { available: false, reason: 'no sole account' }
      return body
    }

    body.fueling = await fuelingStatus(userId, now)
    return body
  }

  // --- routes ---------------------------------------------------------------
  app.get('/.well-known/agent-card.json', (req, res) => res.json(agentCard()))

  app.get('/api/agent/status', asyncH(async (req, res) => {
    res.json(await buildStatus(req))
  }))

  // Minimal JSON-RPC 2.0 A2A endpoint (spec v0.3.0). One real method:
  // `message/send` returns an already-completed Task whose single artifact is
  // the same status JSON the caller's auth tier earns on GET
  // /api/agent/status — the Authorization header is parsed identically, so
  // the two routes can never disagree about what a given caller may see.
  // JSON-RPC-layer errors ride HTTP 200 with an `error` object, per the
  // JSON-RPC 2.0 convention A2A follows. (A body that isn't valid JSON at
  // all never reaches this handler — express.json()'s parse error is
  // answered by index.js's body-parser error middleware as a plain 400, not
  // a JSON-RPC -32700; acceptable for a surface whose card says JSONRPC in,
  // and kept rather than special-cased so /a2a doesn't fork the app-wide
  // malformed-body behavior.)
  app.post('/a2a', asyncH(async (req, res) => {
    const rpc = req.body
    const id = rpc && typeof rpc === 'object' && !Array.isArray(rpc) && 'id' in rpc ? rpc.id : null
    const reply = (payload) => res.json({ jsonrpc: '2.0', id, ...payload })

    if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      return reply({ error: { code: -32600, message: 'Invalid Request: expected a JSON-RPC 2.0 object with a string `method`.' } })
    }

    if (rpc.method === 'message/send') {
      // The message's own content is deliberately not interpreted: this is a
      // single-purpose status agent (the card's two skills are both status
      // reads), so ANY message earns the status artifact for the caller's
      // tier — parsing intent out of free text here would be inventing a
      // capability the card doesn't declare.
      const status = await buildStatus(req)
      return reply({
        result: {
          id: crypto.randomUUID(),
          contextId: crypto.randomUUID(),
          kind: 'task',
          status: { state: 'completed', timestamp: new Date().toISOString() },
          artifacts: [
            {
              artifactId: crypto.randomUUID(),
              name: 'omnifuel-status',
              parts: [{ kind: 'data', data: status }],
            },
          ],
          history: [],
        },
      })
    }

    if (rpc.method === 'tasks/get') {
      // -32001 is A2A's TaskNotFoundError. Always: tasks are not persisted —
      // message/send returns its full result inline, so there is never a
      // task to look up later. Saying so beats a fake empty task.
      return reply({ error: { code: -32001, message: 'Task not found: tasks are not persisted. This endpoint is stateless — message/send returns its complete result inline.' } })
    }

    return reply({ error: { code: -32601, message: `Method not found: ${rpc.method}` } })
  }))
}
