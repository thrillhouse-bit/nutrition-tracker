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
> reasonable, honest starting point that satisfies Oura's and Garmin's OAuth
> developer requirements for a public Privacy Policy and Terms of Service URL.
> They have **not** been reviewed by a lawyer. Read them, fill in the
> placeholders below, and get professional review before relying on them —
> especially the health-data, liability, and governing-law sections.

## Where to host

Serve the two files at these canonical URLs (this is what to register with
Oura/Garmin as the developer application's privacy-policy and terms URLs):

| File | URL |
|---|---|
| `privacy-policy.html` | https://omnifuelapp.tech/privacy |
| `terms-of-service.html` | https://omnifuelapp.tech/terms |

The pages cross-link to each other and to https://omnifuelapp.tech using those
canonical paths, so wire the routes `/privacy` and `/terms` to these files
(e.g. a reverse-proxy rewrite or a static route). Both are plain static HTML —
no server logic required.

## Contact inbox

The pages list **privacy@omnifuelapp.tech** as the contact / data-deletion
address. **This inbox must actually exist and be monitored** (a real mailbox
or a forwarding alias) before you publish — Oura/Garmin reviewers and users
will use it. This address was updated to match the app's real domain but its
existence has not been verified — confirm it's live before publishing, or
replace `privacy@omnifuelapp.tech` everywhere in both HTML files with a
different address.

## Placeholders to fill in

Every item below appears in the pages as a highlighted bracketed placeholder
(`[LIKE THIS]`). Search both HTML files and replace each before publishing:

- `[EFFECTIVE DATE — fill in]` — the "Last updated" date near the top of **both**
  pages (e.g. `August 24, 2026`).
- `[LEGAL ENTITY / OWNER NAME]` — the person or entity operating the app
  (appears in both pages: intro/scope, IP, liability, indemnification, contact,
  and footer copyright). Do not leave this generic — reviewers expect a named
  operator of record.
- `[GOVERNING-LAW JURISDICTION]` — the state/country whose law governs the Terms
  and where disputes are heard (Terms §12). Pick where the operator is based.
- `[DATA HOSTING LOCATION / COUNTRY — fill in or generalize]` — where the app
  and its database are hosted, for the Privacy Policy's international-users
  section (§11). Fill in the real region, or generalize the sentence if hosting
  moves around.
- `[YEAR]` — the copyright year in each page's footer.

## Notes on accuracy (why the pages say what they say)

- **Multi-user accounts (updated):** the app now has self-service signup with
  email + hashed password per account, and a per-account biometric profile.
  The Privacy Policy's "Information we collect" and "Your rights" sections
  describe this for real — they used to (incorrectly) claim no accounts or
  logins existed at all. Keep this note in sync if the auth model changes
  again.
- **Label photos → Anthropic:** the OCR route sends the nutrition-label image to
  the Claude API and stores only the extracted structured values, not the image.
  The Privacy Policy states this, and that API inputs are not used to train
  Anthropic's models.
- **Wearable tokens are server-side:** OAuth access/refresh tokens live in the
  server's database/store and are never returned to the client. The pages say
  so, and are **honest** that this is a personal project with no security
  certification and that tokens may be unencrypted at rest depending on
  deployment — adjust that wording if you harden storage.
- **Garmin is described as planned:** the app currently ships the Oura
  integration; Garmin is written in so the same published URLs cover it once the
  Garmin Health API integration lands. If Garmin support is dropped, remove those
  references.
- If the app's behavior changes (new data collected, new third parties, ads,
  any selling/sharing of data), update both pages — several sections make
  explicit promises ("no ads," "never sold or shared") that must stay true.
