# Legal pages (TEMPLATES — review before use)

Two self-contained, hostable HTML pages for the OmniFuel Tech app, branded
for **omnifuelapp.tech**:

- `privacy-policy.html`
- `terms-of-service.html`

They are written to match what the app actually does (food logging; Open Food
Facts + USDA lookups; Claude vision label OCR; Oura and, later, Garmin wearable
integration via OAuth). Each is a single `<!doctype html>` file with all CSS
inline — no external resources, no build step — and is mobile-friendly.

> **These are TEMPLATES, not legal advice.** They were drafted to be a
> reasonable, honest starting point intended to support Oura/Garmin review for
> a public Privacy Policy and Terms of Service URL.
> They have **not** been reviewed by a lawyer. Read them, configure the
> operator-specific values below, and get professional review before relying on them —
> especially the health-data, liability, and governing-law sections.

## Where to host

Serve the two files at these canonical URLs (this is what to register with
Oura/Garmin as the developer application's privacy-policy and terms URLs):

| File | URL |
|---|---|
| `privacy-policy.html` | https://omnifuelapp.tech/privacy |
| `terms-of-service.html` | https://omnifuelapp.tech/terms |

The Express server owns `/privacy` and `/terms`. It renders these source
templates only when the legal launch gate is complete; otherwise both routes
return 503 and new-account signup remains disabled.

## Contact inbox

Set `LEGAL_CONTACT_EMAIL` to an inbox that actually exists and is monitored (a
real mailbox or forwarding alias). The server substitutes it into both link
destinations and visible contact text.

## Required launch configuration

Set these environment variables; do not edit guesses directly into the HTML:

- `LEGAL_EFFECTIVE_DATE` — the "Last updated" date near the top of **both**
  pages (e.g. `August 24, 2026`).
- `LEGAL_ENTITY_NAME` — the person or entity operating the app
  (appears in both pages: intro/scope, IP, liability, indemnification, contact,
  and footer copyright). Do not leave this generic — reviewers expect a named
  operator of record.
- `LEGAL_GOVERNING_JURISDICTION` — the state/country whose law governs the Terms
  and where disputes are heard (Terms §12). Pick where the operator is based.
- `LEGAL_DATA_HOSTING_LOCATION` — where the app
  and its database are hosted, for the Privacy Policy's international-users
  section (§11). Fill in the real region, or generalize the sentence if hosting
  moves around.
- `LEGAL_YEAR` — the copyright year in each page's footer.
- `LEGAL_CONTACT_EMAIL` — the monitored privacy/deletion inbox.
- `LEGAL_REVIEWED=true` — an explicit operator acknowledgement after review.

The gate rejects empty, placeholder-like, malformed email/year/date values.
The renderer also refuses to publish if any bracketed template marker remains.

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
