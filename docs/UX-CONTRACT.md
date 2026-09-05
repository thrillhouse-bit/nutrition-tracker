# Body Current product contract

This is the cross-screen behavior contract for changes that affect more than
one route. Component-level visual rationale remains in `docs/DESIGN.md`.

## One daily planning loop

The canonical loop is:

1. Complete one AFP profile during onboarding.
2. Add planned training in Plan or sync completed training from a provider.
3. AFP computes one set of daily energy and macro targets.
4. Today shows intake and its next action against those exact targets.
5. Plan explains and, when needed, explicitly overrides that same day.

Insights uses today's canonical AFP target as its clearly labeled reference
line. It does not read `daily_targets`; reconstructing target adherence against
each historical day's frozen AFP snapshot is a separate future enhancement.

There is no second visible static-target product. New screens must not derive
targets independently. They consume AFP `computedTargets` (baseline) and
`targets` (current, including safe explicit overrides).

### Profile migration

`server/afp/migration.js` may copy missing fields from the legacy calculator
profile. It must never overwrite an explicit AFP value. The browser reads only
the server-returned AFP profile; it does not merge two profiles itself.

### Training reconciliation

AFP planned sessions drive both the plan calculation and Today's workout
context. A real completed wearable workout wins over a planned estimate for
the displayed signal and for energy reconciliation. A legacy manual/demo
signal may be replaced by the AFP session. This ordering prevents both double
counting and a Plan session disappearing from Today.

### Calendar-day ownership

The browser sends `from` and `to` instants for its local calendar day to Today
and AFP plan reads. The server must not silently substitute its own timezone
when deciding whether a plan is today's recomputable plan or a frozen past
snapshot.

## Account isolation

- Server-side private rows remain keyed and queried by authenticated user ID.
- Browser-private local state is namespaced as
  `nt_<namespace>_v2:user:<encoded user id>`.
- Unattributable v1 recents/outbox data is deleted, not assigned to the next
  person who signs in.
- Offline queue items carry their owner ID and are replayed only for that same
  authenticated account.
- Any replay failure, including 401/403, preserves the queued item for its
  owner rather than silently deleting it or sending it as another account.
- Authenticated `/api` responses use `Cache-Control: no-store, private` and
  `Vary: Cookie`. The service worker must never runtime-cache API responses.
- Logout clears private in-memory state and removes obsolete API caches.
- Protected routes verify both the signed session and the continued existence
  of its account. Deleting an account therefore revokes copied sessions on
  every device, not only the browser that submitted the deletion.
- Public login is throttled by client address and normalized account identity;
  signup is throttled by client address. Responses stay generic and expose a
  `Retry-After` duration without logging raw limiter keys.
- Optional alpha signup uses exactly ten high-entropy invitation codes. Public
  status exposes only whether an invite is required; plaintext codes are never
  logged or persisted, and the digest ledger remains single-use after deletion.

## Account data lifecycle

Source of business truth: `legal/privacy-policy.html` sections 6, 8, and 9;
`legal/terms-of-service.html` section 11. The UI consequences are:

- Connections owns account export, logout, and permanent deletion. Provider
  disconnection and synced-history deletion remain separate narrower actions.
- Export downloads JSON for the authenticated account: account/legal record,
  nutrition and manual hydration logs, target history, profiles, planning data, provider metadata,
  and wearable history with explicit Oura, Garmin, and device-originated Apple
  Health attribution. Password/session credentials, provider OAuth tokens,
  Apple ingest tokens, and the shared food lookup cache are excluded.
- Account deletion is irreversible hard-delete. The app-owned Sheet names the
  account, scope, shared-cache exception, and lack of recovery; Cancel/Close is
  focused first. Confirmation requires the current password and an exact typed
  email. The mutation stays open and blocks duplicates until server success.
- Failure keeps the Sheet open, clears the password, and preserves the typed
  email for correction. Success clears server session cookies, account-scoped
  local storage, private in-memory state, and returns to authentication. There
  is no Undo because the database deletion is a cascade hard-delete.

## Hydration log

Today owns the account-scoped manual water log. It reads the browser's
`from`/`to` local-day bounds, so its total and rows use the same calendar day
as food intake. Amounts persist in millilitres; the native unit select may
display or enter millilitres or fluid ounces, while an explicitly labelled
native date-time picker records when the person drank it. Quick add, add,
edit, and delete retain their values on failure and expose an inline error.

Hydration is context only: it does not alter AFP energy, carbohydrate, sodium,
or fluid calculations. No sweat-replacement or sodium advice appears.

The hydration Customize sheet owns optional user-set daily water goals, preferred
mL/US fl oz display, and three editable quick-add cup/bottle amounts. Existing
accounts start without a goal. Values persist in canonical mL; unit changes
convert display only and do not round or reinterpret saved volumes. Numeric
bounds (positive and at most 10,000 mL) are input limits, not recommendations.
Goal and quick-add changes save only changed fields through an account-scoped
atomic patch; unrelated concurrent settings writes must survive. Preferences
are included in account export and deleted with the account.

Only today compares intake with the current user-set goal. Historical dates
show actual intake without applying today's preference retroactively. Total
intake stays uncapped; the visual progress bar caps at 100%. Removing a goal
returns to intake-only tracking. Settings require explicit Save, retain drafts
on failure, focus the first invalid field, and offer Keep editing or Discard
changes on Cancel when dirty. No goal is inferred from a wearable, body size,
weight-loss strategy, or training session.

## Legal launch gate

Privacy and terms content is publication-ready without operator metadata.
Production requires a meaningful explicit `LEGAL_VERSION` and a
`LEGAL_REVIEWED=true` acknowledgement before the public documents and signup
become available. The version is the re-consent boundary; it is not inferred
from unrelated operator metadata.
Signup requires an affirmative Terms agreement and Privacy Policy
acknowledgement, and stores the published legal version plus acceptance time on
the account.

If any required value is absent or invalid:

- `/privacy` and `/terms` return an honest 503 unavailable page, never the SPA
  or a policy containing placeholders;
- the authentication screen disables account creation; and
- `POST /api/auth/signup` independently rejects account creation with 503.

Existing users may still sign in. Legal status is public only as readiness,
version, links, and missing configuration labels; configured values are not
exposed through the status endpoint.

An existing account with a missing or superseded acceptance is held outside
the private app shell and ordinary private APIs until it affirmatively accepts
the server's current version. The gate preserves sign-out, legal-document
links, account export, and permanent deletion; auth exposes only the
required/not-required boolean.

## Legacy compatibility boundary

The old `/profile`, `/targets`, `/plan/today`, manual workout route, and their
tables may remain while older clients migrate. They are compatibility surfaces,
not product authority. Do not add a new user-facing flow to them. Remove them
only through an explicit API/schema deprecation with native-client checks.

## Canonical control ownership

### Food entry

Log and the global Add food sheet share `FoodEntryChoices`: Search foods and
Scan a package are the only top-level methods. Search includes a direct
"Enter nutrition manually" fallback even when no query has been entered or
the network is unavailable. Scan opens barcode lookup, retaining typed barcode
digits, and offers "Read nutrition label instead" for Nutrition Facts extraction.
These are alternative capture methods, not two ways of scanning the same content.
Both fallback screens offer a clear return to their parent method. Existing
confirmation, account-owned recents, offline queue and saved-entry editing remain
owned by App. The meal-grouped log keeps its existing rows; `MealMacroSummary`
adds serving-adjusted protein/carbohydrate/fat sums with missing data disclosed.

### Today recommendation

The recommendation is a next action, not raw target arithmetic. Remaining energy
and macros are always clamped at zero in user-facing copy. A covered or exceeded
energy target takes precedence over ordinary protein pacing, and suggested meal or
pre-workout amounts never exceed what remains in the daily plan. When a target is
already covered, copy says so directly instead of prescribing a negative or
unnecessary catch-up amount. The expandable rationale remains the place where
the app names the signals that drove the recommendation.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select | Shared `inputCls` styling plus browser semantics | Domain option sets only | Component tests and browser walkthrough |
| Date | Native date/time input | Browser locale and keyboard behavior; ISO values at the API boundary | `time` for session time; date navigation remains app-authored buttons | AFP component tests and browser walkthrough |
| Form | App-owned validation | Per-form submit handlers with `noValidate`; Zod remains server authority | Inline error copy through shared `ErrorNote` | Unit/component and API schema tests |

Native select and time controls are intentional for this mobile-first PWA: the
supported browser/OS owns the popup geometry, locale, keyboard, and assistive
technology integration. Body Current owns labels, option vocabulary, validation,
and ISO storage—not a second custom picker implementation.
