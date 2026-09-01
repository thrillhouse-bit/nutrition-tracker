# UX Contract

## Product context

- Audience: Solo action-RPG players on desktop and mobile web.
- Primary jobs: Start or continue safely; point-and-click through a readable authored region; approach and act on people, resources, enemies, objects, and gates; understand and complete the current objective; develop persistent 1–99 skills; manage a 28-slot backpack, equipment, banked materials, and quest journal; use a mythology-specific patron kit; recover predictably after pause, reload, or defeat.
- Target market(s): English-language build; no market-specific behavior is currently claimed.
- Active locales: `en` only.
- Language/content register and native-review policy: Direct English mythic prose; new locales require complete visible and accessible copy review.
- Timezone/calendar policy: Not applicable. Progress uses deterministic play ticks and caller-supplied save timestamps, never calendar mechanics.
- Accessibility target: WCAG 2.2 AA for owned HTML controls and text; Canvas action has labeled HTML alternatives and reduced-motion behavior.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Story order, quest rules, save boundaries | `RPG-VERTICAL-SLICE.md` | Product/domain contract | 2026-08-31 |
| Visual direction and original-IP boundary | `GAME-DIRECTION.md` | Product/design brief | 2026-08-31 |
| Arena combat, powers, maps, enemy identities | `src/game/` exported registries | Runtime domain contract | 2026-08-31 |
| Persistence schema and recovery | `src/rpg/save.js`, `src/rpg/state.js` | Runtime schema | 2026-08-31 |
| Billing / payment | Not applicable; no commerce | Scope statement | 2026-08-31 |
| Legal / regulatory copy | `GAME-DIRECTION.md` original-IP boundary | Product brief | 2026-08-31 |

## Visual contract

- Project `DESIGN.md`: `control-tower-shift/DESIGN.md`.
- Token ownership model (`DESIGN.md` generated / existing runtime canonical): `DESIGN.md` records intent; map/combat palettes are runtime-canonical.
- Runtime design-system/token source: `src/rpg/content.js`, `src/game/campaign.js`, `src/renderer.js`, with route-chrome mapping in `src/ControlTowerRPG.jsx`.
- Mapping/export/adapters: Canvas renderers consume palette objects; the RPG route owns one HTML chrome adapter.
- Token drift gate: strict premium audit plus changed-file raw-color and duplicate-token review.
- Supported themes: Dark product chrome with authored light/dark world palettes; system forced-colors behavior retained for controls.
- Design-context owner/review policy: Update `DESIGN.md` only for durable cross-act decisions and update the runtime owner in the same change.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Patron selection | `ControlTowerRPG` shrine grid | canonical Tier-1 roster + `powersForGod` | semantic-button grid | keyboard + touch + loadout tests |
| Form | Not applicable | no text-entry form | none | static audit |
| Scrollbar | Application global stylesheet / native forced-colors | `src/index.css` | overlay overflow only | computed style + narrow browser |
| Toast | Inline persistent save alert | `ControlTowerRPG` save status | error only | save-failure component test |
| Persistence | `rpg/save.js` | versioned envelope with v1→v2 migration | new / continue / recover | storage matrix + E2E |
| Dialogue | `ControlTowerRPG` + content registry | `rpg/content.js` | next / deterministic skip | keyboard + skip-equivalence tests |
| Combat result | `ControlTowerRPG` + reducer | encounter outcome event | win / defeat | browser + exactly-once tests |
| World navigation | `rpg/pathfinding.js` + semantic target buttons | map bounds/collisions/traversal lanes | ground destination / approach-and-act | path unit tests + browser coordinates |
| Skills | `rpg/progression.js` | stored XP + derived 1–99 curve | combat / divine / gathering / artisan / world | curve + award + save tests |
| Inventory | `rpg/progression.js` | 28-slot inventory and item registry | physical / stackable / quest record | capacity + normalization + browser panel |
| Quest journal | registered quest definitions + reducer progress | registry and current save | main / side / completed | reducer + browser panel |
| Shop / Trading | `rpg/economy.js` + physical merchant entity | immutable shop registry + scalar drachma wallet | buy / sell | atomic domain + reducer + browser tests |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | Stable bordered label | border/surface brightens | 2px gold outline | color/impact, no layout shift | visible label, rejects input | stable geometry | adjacent owned text |
| Icon button | Accessible name required | contrast increases | visible outline | pressed cue | rejects input | n/a | n/a |
| Shrine card | deity/domain/power text | gold border | visible outline | binds patron | n/a | n/a | missing canonical loadout blocks card |
| Dialogue | speaker + subtitle + next/skip | action emphasis | logical action order | deterministic advance | input layer locked | n/a | invalid conversation restores play |
| Combat control | power + hotkey/readiness | border brightens | visible outline | queues one action | cooldown remains legible | n/a | unavailable action is a no-op |

## Dataset navigation

- Admin tables: Not applicable.
- Exploratory lists: Patron shrine renders the complete Tier-1 roster; no pagination or search.
- URL state: Exact hash selects app, arena, or RPG only; progression never lives in the URL. Skills, Pack, and Journal are transient side panels and never alter route history.
- Page size: Not applicable.
- Empty/no-results/error/loading treatment: Missing save disables Continue; corrupt/future save exposes recoverable New Story/checkpoint behavior; lazy import reserves the stage.
- Back/scroll restoration: Hash navigation unmounts the outgoing mode and its listeners/RAF. RPG restore comes from the last valid boundary save, not DOM history.
- Selection scope: One active patron; switching is allowed only at a visited shrine and outside combat.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| New Story | Title action | immediate local reset | Beacon Overlook start | objective + saved state | remain on title with save alert | exploration controls | `RPG-VERTICAL-SLICE.md` |
| Continue | Valid save | synchronous validation | exact valid checkpoint | location/objective HUD | recover last valid shrine or New Story | exploration controls | `src/rpg/save.js` |
| Choose patron | Shrine card | one reducer event | same shrine/world | “Bound,” kit HUD, immediate save | reject unknown patron and keep shrine open | selected patron card | `src/rpg/state.js` |
| Enter encounter | Authored gate/objective | deterministic adapter setup | combat arena | encounter title/HUD | restore pre-entry checkpoint | combat actions | `src/rpg/combatAdapter.js` |
| Win encounter | Terminal combat event | exactly-once reducer transition | authored return spawn/next beat | completion result + objective update | duplicate event is no-op | Continue action | `RPG-VERTICAL-SLICE.md` |
| Defeat | Terminal combat event | checkpoint restore | exact pre-entry world checkpoint | defeat result | deterministic retry | Return action | `RPG-VERTICAL-SLICE.md` |
| Dialogue skip | Skip/Escape when safe | immediate deterministic end-state | restored world control | same flags/rewards as viewed path | invalid conversation restores play | nearest logical world control | `RPG-VERTICAL-SLICE.md` |
| Pause/resume | Escape or Pause/Resume | immediate loop halt | same world/combat state | explicit Paused overlay | unmount clears listeners/RAF | Resume | `UX-CONTRACT.md` |
| Region transition | Authored exit | boundary save | named destination spawn | location/act transition | restore previous valid checkpoint | exploration controls | `RPG-VERTICAL-SLICE.md` |
| Move to destination | Ground click/tap | accelerated distance-driven walk over a collision-aware route | selected walkable point with exact settled pose | gold ground reticle + visible gait/contact shadow | blocked-route inline note | world control | `RPG-SYSTEMS.md`, `src/rpg/locomotion.js` |
| Approach and act | Semantic world-target activation | collision-aware route | interaction range, then authored action | dialogue/resource/combat/gate result | blocked-route inline note | target or resulting surface | `RPG-SYSTEMS.md` |
| Gain skill XP | Resolved skill action, quest, or combat victory | deterministic reducer event | same world/result surface | level/XP record updates | invalid skill/gain is a no-op | prior control | `RPG-SYSTEMS.md` |
| Open shop | Approach a merchant world target | collision-aware route + reducer map validation | merchant ledger side panel | wallet, stock, and carried counts | remote/unknown merchant is inert | first Buy action | `src/rpg/economy.js` |
| Buy | Merchant ledger quantity action | one replay-safe reducer event | same merchant ledger | exact item, quantity, and drachma total in live status | insufficient funds/stock/space leaves wallet, item, and stock unchanged | activated quantity action | `src/rpg/economy.js` |
| Sell | Merchant ledger quantity action | one replay-safe reducer event | same merchant ledger | exact item, quantity, and drachma total in live status | insufficient carried quantity leaves inventory, wallet, and stock unchanged | activated quantity action | `src/rpg/economy.js` |
| Close shop | Close button or Escape | immediate reducer close | exploration at the merchant | world targets return | reload/travel also clears live merchant state | merchant world context | `src/rpg/state.js` |

## Navigation and responsive behavior

- Route document title policy: RPG sets “Control Tower: Oathbearer”; arena sets its own distinct title; exiting restores the host app title.
- Route error / 403 page behavior: No permission model. Lazy-load failure must show an app-owned route error with return action rather than a blank stage.
- Breadcrumb/tab/route-state policy: Not applicable; location and act are HUD state, not tabs.
- Sidebar/drawer/bottom-sheet transformation: Full-screen overlays remain centered on desktop and safe-area-bounded sheets on narrow screens.
- Responsive table strategy: Not applicable.
- Truncation/full-value access: Objectives and dialogue wrap. Patron kit may compact visually but full name/description stays in the DOM.
- Focus restoration and sticky-obstruction policy: Overlays focus their primary safe action and restore focus/control context when closed; touch controls and virtual safe areas never cover the active action.

## Overlays and feedback

- Dialog primitive: App-owned full-screen layer with semantic headings and buttons; no native dialog functions.
- Destructive confirmation levels: Replacing an existing save with New Story requires one explicit app-owned confirmation naming the checkpoint loss.
- Toast placement/duration/deduplication: Save failure is persistent inline status, not an expiring toast; repeated identical errors dedupe visually.
- Alert/banner scope and persistence: Objective is route-local; save failure persists until successful save; act completion persists until acknowledged.
- Tooltip delay/dismissal: No hover-only tooltip is required for core play.
- Unsaved-changes behavior: World movement is not boundary-saved. Shrine, quest, region, and encounter boundaries save immediately.
- Layer/z-index contract: pause/result/act transition > shrine/dialogue > HUD > canvas.

## Async and resilience

- Mutation default (pessimistic/optimistic/queued): Pure local reducer transition followed by immediate boundary persistence.
- Routine in-game trades do not require confirmation. The pure economy resolver atomically preflights currency, carried quantity, backpack capacity, finite stock, safe arithmetic, and physical map access before settling a buy or sell.
- Shop stock restocks from deterministic `playtimeTicks`; wall-clock time, reloads, and reopening cannot accelerate it. Processed transaction IDs are bounded in the save and prevent duplicate settlement.
- Idempotency and duplicate-submit policy: Encounter, dialogue effect, reward, and objective events are guarded by stable IDs and current-state match.
- Auto-save/draft recovery: Boundary-only versioned saves; no mid-combat/projectile persistence.
- Offline/read-stale/write behavior: Fully offline-capable; storage denial shows persistent save warning while play continues.
- Retry/backoff/timeout behavior: No network dependency. A later boundary retries local save.
- Version conflict and multi-tab behavior: Future schema is refused; latest successfully loaded boundary is authoritative. Multi-tab live merge is out of scope and must not silently combine states.
- Session expiry/re-authentication: Not applicable.
- Long-running progress and return path: Acts are linear and checkpointed; pause and route exit remain available.
- Stale-request cancellation/invalidation and pending-state ownership: No remote request. RAF, timers, listeners, and combat sessions are canceled on unmount/mode change.
- Dialog/form preservation and retry after mutation failure: UI state remains playable after storage failure; next boundary retries.

## Validation

- Schema/validation layer: Explicit v1→v2 migration and current normalization in `src/rpg/save.js`; canonical IDs come from content/game registries.
- Trigger timing: Validate before exposing Continue and again on load.
- Error summary/inline policy: Corrupt/future/unavailable save state is stated on the entry surface with recovery actions.
- Server error mapping: Not applicable.
- Sensitive-value handling: Saves contain only local game progression; no account secrets or billing data.
- `noValidate`, first-invalid focus, duplicate-submit prevention, unsaved changes, and submit recovery: No HTML forms; semantic actions reject duplicate/invalid events and preserve stable focus geometry.

## Permission and clipboard

- Permission UI strategy (hide vs disable vs 403 page): No permissioned feature.
- Clipboard copy policy (truncated preview + copy button, no secret in toast): Not applicable.
- Disabled-state explanation (tooltip with reason): Continue visibly disables when no valid save; combat powers retain their label while on cooldown.

## Verification

- Required static commands: `python .../audit_project.py control-tower-shift --mode strict`; anti-pattern changed-file searches; `git diff --check`.
- Browser/device/locale/theme matrix: Desktop 1280×800 and portrait 390×844; keyboard, pointer, touch; normal and reduced motion; English; forced-colors spot check.
- Accessibility checks: Semantic actions, accessible names, visible focus, 44px touch targets, dialogue live text, Escape/pause, reduced-motion, no horizontal overflow.
- Native-language/domain review and target-user evidence: English authored copy review; no market-local claim.
- Japan readiness matrix: Not applicable.
- Component-state/visual regression coverage: Title/new/continue, shrine selected/unselected, dialogue next/skip, combat ready/cooldown/pause/win/defeat, save warning, act boundary.
- Canonical sibling flow used for comparison: Arena route input, power, pause, renderer, and reduced-motion contracts.
- Project audit command/result: Record at the end of each accepted act.
- CRUD full-flow evidence: Not applicable; cover New/Continue/save/reload/recovery instead.
- Failure-path evidence: Corrupt/future/unknown/throwing storage, defeat restore, duplicate terminal event, mode switch cleanup.
