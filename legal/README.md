# Legal pages (TEMPLATES — review before use)

Two self-contained, hostable HTML pages for the Body Current app, branded
for **Body Current**, hosted at the existing production domain:

- `privacy-policy.html`
- `terms-of-service.html`

They are written to match what the app actually does (food logging; Open Food
Facts + USDA lookups; Claude vision label OCR; Oura and, later, Garmin wearable
integration via OAuth). Each is a single `<!doctype html>` file with all CSS
inline — no external resources, no build step — and is mobile-friendly.

> **These documents are not legal advice.** They were drafted to be a
> reasonable, honest starting point intended to support Oura/Garmin review for
> a public Privacy Policy and Terms of Service URL.
> Read them and get professional review before relying on them — especially
> the health-data and liability sections.

## Where to host

Serve the two files at these canonical URLs (this is what to register with
Oura/Garmin as the developer application's privacy-policy and terms URLs):

| File | URL |
|---|---|
| `privacy-policy.html` | https://bodycurrent.app/privacy |
| `terms-of-service.html` | https://bodycurrent.app/terms |

The Express server owns `/privacy` and `/terms`. It renders these source
templates only when the legal launch gate is complete; otherwise both routes
return 503 and new-account signup remains disabled.

## Required launch configuration

Set both a meaningful `LEGAL_VERSION` (for example, `2026-09-04`) and
`LEGAL_REVIEWED=true` only after reviewing these documents. The explicit
version is stored with each acceptance and establishes the re-consent boundary
when either document changes; the acknowledgement enables signup and the
public `/privacy` and `/terms` routes. The renderer refuses to publish if any
bracketed template marker remains.

## Notes on accuracy (why the pages say what they say)

- **Multi-user accounts and lifecycle (updated):** the app now has self-service signup with
  email + hashed password per account, an affirmative legal acknowledgement
  whose published version/time is stored on the account, authenticated JSON
  export, and password + exact-email verified permanent deletion. The Privacy
  Policy's "Information we collect," retention, and rights sections must stay
  in sync with those routes.
- **Daily Fuel Plan health/safety data:** the canonical profile stores body and
  goal inputs plus optional pregnancy/postpartum and eating-disorder/restriction
  safety flags; training plans and reproducible daily snapshots are also
  persisted. The policy names these explicitly. Adding a profile/workout field
  requires a disclosure review, not only a schema/UI change.
- **Label photos → Anthropic:** the OCR route sends the nutrition-label image to
  the Claude API and stores only the extracted structured values, not the image.
  The Privacy Policy links Anthropic's current commercial/API training and
  retention disclosures and states their default plus exceptions.
- **Wearable tokens are server-side:** OAuth access/refresh tokens live in the
  server's database/store and are never returned to the client. The pages say
  so, and are **honest** that this is a personal project with no security
  certification and that tokens may be unencrypted at rest depending on
  deployment — adjust that wording if you harden storage.
- **Garmin is implemented but provider-gated:** OAuth/webhook code exists, but
  real use still requires Garmin approval, evaluation, verification, and
  potentially commercial licensing. The server fails closed unless
  `GARMIN_INTEGRATION_VERIFIED=true`; that acknowledgement must follow review
  of the current private partner wire and webhook-security requirements, not
  merely receipt of credentials. Do not claim platform compliance merely
  because the code path exists; preserve Garmin attribution in UI and exports.
- If the app's behavior changes (new data collected, new third parties, ads,
  any selling/sharing of data), update both pages — several sections make
  explicit promises ("no ads," "not sold," and no marketing sharing) that must
  stay true, while still disclosing infrastructure processors honestly.
