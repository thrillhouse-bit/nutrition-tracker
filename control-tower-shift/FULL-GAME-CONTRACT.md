# Aegean Frontier: The Unwritten Age Complete-Game Contract

Status: **active production contract**  
Release model: **one cohesive complete-game beta; no partial-system production releases**  
Canonical route: `/#control-tower-rpg`

## Product promise

Aegean Frontier: The Unwritten Age is an original Greek-mythology, classless, open-zone role-playing
game. Its durable play grammar is familiar to players of classic point-and-click
skill RPGs: travel, gather, fight, bank, craft, trade, quest, equip, improve, and
return to a changed world. Its names, characters, mythology synthesis, story,
maps, dialogue, art, interface, economy data, encounters, and progression are
original.

The current five-act build is a reliable vertical slice. It is not the complete
game and must not be described, tagged, deployed, or marketed as one.

## What “complete” means

### Measured playtime

- First-time main-story median: **35–45 hours** across at least 20 blind,
  representative human playtests.
- First-time main-plus-substantial-side-content median: **55–75 hours**.
- Time may not be manufactured through forced idling, inflated travel time,
  mandatory repeated fights, slow respawns, or arbitrary skill grinding.
- Objective telemetry must distinguish story, dialogue, exploration, combat,
  skilling, inventory/economy, pause, and retry time.

### Authored world and story floor

- Five production regions with at least **60 materially distinct maps/zones**.
- At least **20 main quests**, **35 regional side quests**, **10 cross-act
  character/deity quests**, and **5 system-mastery quests**.
- At least **60 recurring named NPCs**, **50,000 authored dialogue words**,
  **80 encounter configurations**, and **12 named bosses or elites**.
- Every dialogue reference resolves to an authored scene. Scaffold/fallback
  conversation completion is forbidden on released content.
- At least 20 choices have visible reactivity, eight have delayed consequences,
  and all eligible endings visibly change postgame NPC, access, or economy state.
- Every quest declares its dramatic question, systems used, recovery behavior,
  durable reward, downstream consequence, expected time, and originality notes.

### Skill and item floor

- All 22 skills have a complete learn → practice → mastery loop with at least
  five useful level bands and a visible unlock path.
- Every gathering skill has tiered tools, level gates, geographically distributed
  nodes, meaningful yields, and at least one rare or mastery outcome.
- At least **200 useful item definitions**, **100 reachable recipes**, **150
  placed resource nodes**, **15 merchants**, and **8 physical banks**.
- Every non-quest item has an obtainable source and a meaningful use, recipe,
  equipment role, quest role, trade sink, or consumable effect.
- Every recipe ingredient is legitimately obtainable before the recipe matters.
  Every crafted output has a gameplay effect or economy sink.
- Backpack, bank, equipment, drops, death recovery, consumption, crafting, and
  trading remain atomic and exact-once under full capacity, retry, reload, and
  duplicate-input conditions.

### Combat and equipment floor

- Melee, ranged, divine/magic, guard, and vitality progression are derived from
  the actions actually taken, not fixed post-fight bundles.
- Weapons, armor, ammunition, food, tonics, patron powers, enemy resistances,
  and status effects form useful, tested loadout choices.
- At least six equipment slots have a legitimate multi-tier progression ladder;
  every supported slot has a clear purpose or is explicitly removed.
- Weighted drop tables never silently lose rewards when the pack is full.
- Defeat creates a recoverable, exact-once item-reclaim path that survives reload.
- Every story and wilderness encounter begins at an explicit ready boundary and
  remains playable with pointer, keyboard, and touch input.

### World interaction and movement floor

- Click-to-move uses collision-aware routing, readable acceleration/braking, and
  a planted gait rather than translating a static plate.
- Kallias visibly changes stride phase, foot contact, facing, body weight, spear
  carriage, and stop pose. Movement speed is tuned for reading and targeting.
- Resource, NPC, station, bank, merchant, enemy, transport, and quest targets are
  physical world objects. A journal may explain where to go but cannot act as a
  remote station or teleporting control panel.
- Every required target is reachable in every valid world state, and overlapping
  semantic targets cannot intercept one another.

### Economy, accounts, and trading floor

- RPG saves are account-bound and server-backed with schema version, revision,
  optimistic concurrency, local-offline recovery, export/delete coverage, and
  restore history. Two accounts on one browser cannot see or overwrite one
  another's progress.
- Merchants have regional stock, specialization, restock, item-value policy, and
  meaningful currency faucets and sinks.
- Player-to-player trade and any market/auction surface are server-authoritative,
  idempotent, auditable, and settled through escrow. Client reducers never grant
  another player inventory or currency.
- Aegean Frontier contains no real-money market, purchasable power, or tokenized asset.

### Legal and product-authority floor

- A public Aegean Frontier release is blocked until Aegean-specific Terms and
  Privacy Policy are approved in writing by the product owner and counsel,
  identify the Aegean operator and intended domain(s), and are published at the
  linked URLs. A reachable URL or an OmniFuel template is not approval.
- The approved review must cover the actual Aegean account and gameplay-save data
  lifecycle (including local/cache and server-backed copies, export, deletion,
  conflict/restore behavior), any gameplay telemetry or diagnostics, the truth
  of any no-ads/no-analytics/no-sale claim, virtual items/currency and any player
  trading or purchase policy (or an explicit statement that each is absent),
  minors/age treatment, and every actual third-party processor/service.
- The release record must retain a dated, versioned approval reference sufficient
  for protected-branch review; it must not expose privileged advice, credentials,
  or personal data.

### Experience and accessibility floor

- A new player learns movement, interaction, combat, gathering, banking,
  crafting, equipment, trade, death recovery, and quest reading through play.
- Desktop, portrait mobile, and short landscape remain functional with 44px
  primary touch targets, no horizontal page overflow, visible focus, semantic
  controls, subtitles, reduced motion, and non-color state cues.
- Save, network, conflict, full-inventory, insufficient-material, death, and
  unreachable-path failures explain what happened and how to recover.
- Performance budgets cover input latency, frame cadence, memory, canvas backing
  pixels, asset loading, and background/hidden rendering.

## Historical audited baseline — 2026-09-02 (`a352344296a12a1e3855017cdda6ad52e0273621`)

This table is a historical snapshot from the recorded 2026-09-02 commit, not
the current game status. The authoritative current measurement is
`npm run report:oathbearer:complete`; its blocked/ready result and derived
counts supersede this snapshot for planning and release decisions.

| Surface | Current | Complete-game floor |
|---|---:|---:|
| Skills | 22 definitions; Devotion (repeatable votive-stand offerings), Guile (an exact-once locked-chest pick), and now Beastbond (an exact-once wild-creature calming, the Sacred Hind at Beacon Overlook) all have real first loops, closing all three skills that previously had zero obtainable XP source anywhere in the game; several other skills still lack repeatable actions | 22 complete loops |
| Items | 97; closes honeyed-figs (Beastbond loop), ambrosia-distillate and clay-loaf (two fully-defined consumables with zero source), and copper-wire/olive-figurehead/woven-tape (three crafting materials with zero source and zero use) — all discovered by an orphan audit comparing every item definition against every recipe output, shop listing, resource node, wilderness loot table, and starting-equipment default | 200 useful |
| Recipes | 58; all ingredients have legitimate sources | 100 reachable |
| Regions | 5 | 5 production regions |
| Maps/zones | 23 small pockets | 60 materially distinct |
| Quests | 10 | 70 total |
| Objectives | 55 | content/time measured, not padded |
| Conversations | 15 / 927 words | 50,000 words; zero fallbacks |
| Story encounters | 20 | 80 configurations |
| Named bosses | 5 | 12 |
| Resource nodes | 26 across all five acts; quarrying, foraging, and woodcutting span full 5-tier curves with a rare/mastery node each; fishing spans four level tiers (sardine/tuna plus red-mullet, sturgeon, hippocamp-roe) with its own two-tier rod line (bronze/iron); stewardship now spans the full 5-tier curve — Beacon Overlook's fallow field (Act I, compost), Pelagos Harbor's salt-damaged garden (Act II, purchased water casks), Wheat Village's frost-locked terrace (Act III, purchased spiced must, tying into the map's own "stilled year"/"First Thaw" story), Slag Road's cinder-fouled plot (Act IV, purchased ration water), and Nyx Foothold's shadowed camp plot (Act V, purchased shadow lantern oil) — each tier at the one genuinely civic location in its region, sharing the bronze/iron hoe tool line | 150 across all regions |
| Banks | 6 — one per act's civic hub (Beacon Overlook, Pelagos Harbor, Wheat Village, Slag Road, Nyx Foothold) plus a second Act I access point at Olive Road, a genuine mid-Act-I hub (an NPC, a merchant, and a quest already sit there); all share one account-wide bank, gated by physical presence | 8 |
| Merchants | 7 — the 5 regional hub specializations plus two gap-closing traders: Philyra (Olive Road, tin ore) and Straton (Storm Anchorage, iron ore *and* cypress-log), which close a real progression gap where bronze-bar and every iron-tier recipe had no obtainable ingredient — cypress-log included — before Act II/III/IV | 15 regional merchants |
| Referential/source/use integrity | 0 errors / 0 domain warnings | 0 errors / 0 domain warnings |
| Production authoring readiness | 92 / 311 release-ready; 219 legacy warnings | all released records ready |
| Account RPG save | authenticated remote-first save, per-account offline cache, revision conflicts; restore history and release matrix pending | server-backed account save |
| Consumables | food healing plus salve/tonic/blessing next-encounter loadouts; the tonic slot now has three tiers (Sage Tonic at Alchemy 20, Moly Tonic at 30, Ambrosia Distillate at 45 — refining a crafted Moly Tonic further) instead of jumping straight from nothing to level 30; Cooking's food curve now has a real mid-tier heal (Sage-Barley Broth at 12) and a mastery-tier feast (Ambrosial Roe Feast at 60, pairing hippocamp-roe — previously the rarest catch in the game with zero culinary use — with ambrosia bloom) — Cooking and Alchemy both now span the full 5-tier curve every gathering skill already has | full useful loadout progression |
| Player trading | absent | authoritative escrow trade |
| Estimated campaign | 1.5–5 hours | measured 35–45 hour median |

These numbers are production budgets, not filler quotas. A smaller count may
replace a target only when measured playtests and system depth prove the same
complete experience; the playtime, integrity, and recovery gates may not be
waived.

## Integrated production program

The implementation may proceed in internal dependency slices, but every slice
lives on the complete-game integration branch and is tested against the whole
game. Production deployment remains blocked until all gates pass.

1. **Authoring and integrity platform** — validated content schemas, dependency
   graph, source/use validation, dialogue and quest lint, route/path checks,
   originality notes, time budgets, and a failing complete-game release gate.
2. **World and progression closure** — tiered resources, tools, obtainable item
   graph, useful recipes/consumables, physical stations, banks, merchants, action-
   derived XP, loadout progression, weighted drops, and recoverable death.
3. **Account economy** — account-scoped migration, server save/revisions/conflict
   recovery, regional economy, authoritative bilateral trade, audit history.
4. **Regional production** — expand Acts I–V through the same measured content
   template: main chapters, side quests, character arcs, system-mastery quest,
   dungeons, boss, reactive return state, art/audio/feedback, and accessibility.
5. **Whole-game acceptance** — automated all-path matrices, economy simulation,
   performance/responsive/accessibility QA, complete normal-UI playthroughs, and
   blind human timing/usability studies.

## Release rules

### Manual legal-product blocker

The current complete-game verifier does not infer legal scope from source code.
Protected review must block any Aegean public release without the approval
reference required above; a green build, working `/terms` and `/privacy` URLs,
or a generic legal acceptance flow is insufficient.

### Release-proof evidence schema

`full-game-release.json` uses evidence schema version 2. Release evidence is
fail-closed: a claimed count, boolean, or `releaseStatus: ready` is never proof.
Every human or browser evidence record must name an immutable artifact below
`control-tower-shift/artifacts/`, the tested snapshot commit immediately before
the final manifest commit (`artifactCommit`, exactly `HEAD^`), a canonical UTC
ISO-8601 timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`),
and a SHA-256 digest; the artifact JSON contains the metric-specific measurements.
The artifact blob at that snapshot, at `HEAD`, and in the working tree must all
match. The final manifest commit may change only `full-game-release.json`; this
allows a later manifest commit to register an already-produced artifact without
self-referential hashing. The gate
recomputes the digest and rejects absent, untracked, locally modified,
future-dated, stale, unbound, or malformed records. There is intentionally no
independent maximum-age rule: immutable ancestor provenance invalidates changed
evidence, while an arbitrary age cutoff would invalidate a still-reproducible
long study.

Git provenance proves that a reviewed artifact is unchanged; it does not prove
that its measurements were truthfully generated. Until producer-signed or
replayable attestations exist, protected-branch review and manual complete-release
authorization are the trust boundary for evidence generation.

The release record is only a provenance index (`id`, `artifactPath`, `artifactCommit`,
`createdAt`, and `sha256`); it must not carry trusted measurements. The bound
artifact is JSON with `{ "schemaVersion": 1, "evidenceType", "measurements" }`.
`evidenceType` must equal the release metric name (or `completeSkillLoop` for a
per-skill proof), and the gate derives all thresholds from that artifact's
measurements. A skill-loop artifact also repeats its `skillId`, which must equal
the index record's known skill id.

#### Save-recovery producer

The following are legacy-compatible technical command identifiers. `npm run
produce:oathbearer:save-recovery-evidence` runs only the allowlisted
save normalization, account-save client, and account-save UI Vitest suites. It
requires successful machine-readable Vitest output for every suite and derives
`saveRecoveryMatrix.measurements.caseCount` from the executed passing assertions.
It writes a schema-v1 `saveRecoveryMatrix` artifact only to the explicit
`control-tower-shift/artifacts/` output path. Producing an artifact does not
register release evidence: protected review must first create the required final
manifest attestation commit described above.

#### Account-conflict producer

`npm run produce:oathbearer:account-conflict-evidence` runs only the allowlisted
account-save API, restore-history, client, UI, and account-gate suites. It
derives `accountSaveConflictMatrix.measurements.caseCount` from passing Vitest
assertions only. Its artifact is scoped to in-process and API contract coverage;
it is not deployed Postgres or network proof, and it is not release evidence
until the reviewed final manifest attestation is committed.

Both deterministic producers reject preexisting or symlinked output targets and
publish only after a complete allowlisted test report validates, using exclusive
same-directory POSIX hard-link allocation (never an overwriting rename). Their
subprocess and path-mutation seams are module-only injections for isolated
producer tests, not production CLI options; protected review remains the trust
boundary for real evidence.

Complete skill loops are individually evidenced by known skill id and a bound
artifact proving learn, practice, mastery, and five level bands; only validated
distinct records contribute to the technical count. Useful equipment slots are
derived at gate time from the live equipment progression catalog, not JSON.
Evidence records belong in the release JSON only after the referenced artifact
has been produced by its real test, study, or review; placeholder evidence is
forbidden.

1. `main` and production may continue receiving unrelated OmniFuel fixes, but
   the Aegean Frontier complete-game branch is not merged or deployed in fragments.
2. No lane may call a module “done” unless its sources, sinks, UI, save behavior,
   failure paths, quests, and browser behavior are integrated.
3. Generated bulk prose or maps do not count until they pass editorial,
   originality, reachability, reward, save, and playtest review.
4. Feature-class inspiration is allowed; proprietary names, assets, quest text,
   layouts, item tables, economy data, branded terminology, or copied expression
   are forbidden.
5. A complete-game claim requires the static gate, full automated suite,
   production build, browser matrix, full normal-UI playthrough, and measured
   human-playtime evidence. No individual green subsystem can substitute.
