# Aegean Frontier — Claude/Hermes swarm directive

## Authority and mission

This is the durable operating directive for the Claude Code lead. The committed franchise name is **Aegean Frontier**. The single-player game is **Aegean Frontier: The Unwritten Age** and a future multiplayer service is **Aegean Frontier Online**. Preserve `Oathbearer` only where it is Kallias's in-world title or a legacy-compatible internal identifier. Do not blindly rename save keys, routes, API paths, database names, schema IDs, verifier commands, branch names, or auth surface tokens.

Claude remains the sole senior integrator. It owns shared runtime, registries, reducer/state, UI, commits, pushes, and acceptance decisions. Hermes workers are bounded producers or reviewers. A Hermes handoff is a claim, not accepted work, until Claude inspects the actual output and reruns the relevant checks.

Read before every dispatch:

- `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/HERMES-CODEX-HANDOFF-PROTOCOL.md`
- `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/HERMES-SPEND-POLICY.md`
- this file
- the current `git status`, active Claude/Hermes roster, and every `*usage*.json` under the work directory

Repository evidence supersedes stale prose.

## Portal capacity is a governor, not a throughput target

Nous exposes up to **400 requests/minute and 4,000,000 processed tokens/minute**. Operate at no more than **100 RPM and 2,000,000 TPM** across all Aegean Frontier Hermes work, leaving at least 50% headroom for context spikes, gateway calls, retries, and other sessions.

- Never run two full-context generative dialogue workers concurrently.
- Start at most one paid generative worker and one narrow read-only validator at a time.
- Stagger worker starts by at least 60 seconds.
- No Hermes worker may spawn subagents, use goal loops, or retry recursively.
- Use `--max-retries 1` where supported. On a 429, stop the lane, record it, and wait at least 30 minutes before reconsidering that model. Never branch around a 429.
- Bound dialogue batches to one questline or 4–6 conversations, a 20-minute wall-clock limit, a $0.50 expected ceiling, and preferably less than 1.5M processed tokens.
- Preserve the existing `$20` new-dispatch stop, `$25` hard Nous cap, and `$5` recovery reserve. Current ledger evidence must be recomputed before every launch.

## Model router

Select from the live Nous catalog based on task shape; do not use a model merely because it is available.

| Work | Default model | Why |
| --- | --- | --- |
| Original dialogue draft batches, codex entries, quest prose | `qwen/qwen3.8-flash`, low reasoning | Proven on this schema; inexpensive; strong long-form output |
| Dialogue/schema coverage, IDs, count reconciliation, reachability, deterministic tests/data | `deepseek/deepseek-v4-flash-0731`, low reasoning | Cheapest proven precise validator/implementer |
| Frontend/visual integration after stable APIs | `qwen/qwen3.8-flash` | Use only when UI judgment is genuinely required |
| Cross-act continuity review after concrete integrated drafts | `moonshotai/kimi-k3` (or exact live Kimi K3 ID) | High-context review only; expensive, so never routine drafting |
| Free auxiliary lane | exact live zero-price SKU after fresh verification | One at a time; small task; never assume cached pricing |

Keep Sonnet on Claude's side as integration lead. Do not route routine Hermes work to premium Kimi or Sonnet. The local cache may show `upstage/solar-pro4:free`, but the spend policy currently classifies Solar Pro4 as paid; policy wins until Claude verifies both live input and output prices and deliberately updates the ledger/policy.

## Dialogue factory

Dialogue is the primary offload target, but drafting must not bypass integration design.

1. Claude first publishes a bounded packet containing: exact act/quest, speaker roster, voice rules, prerequisite flags, objective transitions, consequence IDs, continuity facts, prohibited reveals, word range, schema example, and exact output path.
2. Hermes writes only to `control-tower-shift/artifacts/hermes-dialogue/drafts/<act-or-quest>/<batch>.json`. It must not touch `registry.js`, `state.js`, runtime maps, UI, shared tests, or existing source dialogue.
3. Qwen drafts 4–6 substantive conversations. Every choice must have a distinct player intention, reachable prerequisite, stable ID, immediate reaction, and declared downstream consequence. Writing must be original and grounded in public-domain mythology without copying protected games.
4. DeepSeek validates the concrete draft read-only (or writes one report beside it): schema, IDs, speaker availability, chronology, prerequisite satisfiability, repeated lines, word count, choice/consequence coverage, and likely integration blockers.
5. Claude rejects, revises, or integrates the batch. Integration includes live speaker availability, normal-UI reachability, reducer exact-once behavior, save/reload, tests, and browser acceptance. Raw word count never proves a 40-hour story.
6. Only after acceptance may Claude dispatch the next batch. Do not redo the quarantined Act IV batch until its known runtime speaker/choice/portrait gaps are resolved.

## Tool Gateway router

The five Portal backends are optional capabilities, not quotas:

- **Firecrawl:** bounded primary-source mythology/history grounding. Save concise source notes; never reproduce source prose.
- **FAL:** user-approved concept-art or asset batches after a written visual brief and exact file ownership.
- **OpenAI TTS:** short voice/readability samples after dialogue is integrated, never bulk final voice production without approval.
- **Browser Use:** acceptance of already-integrated reachable dialogue or gameplay; never mutate storage/devtools to skip progression.
- **Modal terminal:** isolated bulk validation or generated-data checks when local execution is unsuitable; never use it to create a second uncontrolled repository state.

Do not invoke a gateway merely to claim all five were used.

## Required Hermes task envelope

Every worker prompt must include:

- one stable task name and one measurable outcome;
- exact writable files/directories and explicit forbidden files;
- statement that other agents share the checkout and their edits must be preserved;
- input sources and canonical schema;
- acceptance criteria and exact verification commands;
- 20-minute / $0.50 / 1.5M-token dialogue stop conditions where applicable;
- no commits, pushes, merges, deploys, installs, purchases, credentials, subagents, goal loops, or blind retries;
- a unique usage JSON path;
- the mandatory `HERMES_HANDOFF_BEGIN` / `HERMES_HANDOFF_END` block.

Safe generative command shape (fill unique lane names and a fully bounded prompt):

```bash
hermes --in /Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/control-tower-mythic-rebuild \
  --provider nous \
  --model qwen/qwen3.8-flash \
  --reasoning low \
  -t terminal,file \
  --usage-file /Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/hermes-aegean-dialogue-<lane>-usage.json \
  -z '<bounded task envelope>'
```

The validator uses `deepseek/deepseek-v4-flash-0731`, stays read-only except for one exact report path, and starts only when aggregate headroom is safe.

## Claude execution loop

1. Finish or safely checkpoint the current lead-owned integration work.
2. Reconcile the **Aegean Frontier** visible-brand rename; preserve lore/internal compatibility boundaries and update tests/evidence.
3. Run the complete-game report and choose the highest-value non-overlapping content batch—not the largest raw count gap.
4. Dispatch one bounded Qwen draft lane. Continue local integration or a disjoint engineering task while it runs.
5. Inspect the usage file and handoff. If the draft is concrete, dispatch one DeepSeek validation lane when capacity allows.
6. Integrate only accepted content; run focused tests, broader Aegean Frontier/Oathbearer-compatible scripts, build, report, `git diff --check`, and real-browser acceptance for user-visible work.
7. Commit and push one coherent green checkpoint to the authorized feature branch. Never merge or deploy before the truthful complete-game gate passes.
8. Record exact accepted/quarantined work, spend, active ownership, and next lanes in `control-tower-shift/PROGRESS.md`, then continue without asking Jackson unless authority is genuinely required.

The goal is sustained useful throughput, not maximum concurrency. If integration becomes the bottleneck, stop drafting and close the queue before launching more workers.
