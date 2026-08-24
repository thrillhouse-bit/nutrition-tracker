# Legal pages (TEMPLATES — review before use)

Two self-contained, hostable HTML pages for the Nutrition Tracker app, branded
for **tryrerun.com**:

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
| `privacy-policy.html` | https://tryrerun.com/privacy |
| `terms-of-service.html` | https://tryrerun.com/terms |

The pages cross-link to each other and to https://tryrerun.com using those
canonical paths, so wire the routes `/privacy` and `/terms` to these files
(e.g. a reverse-proxy rewrite or a static route). Both are plain static HTML —
no server logic required.

## Contact inbox

The pages list **privacy@tryrerun.com** as the contact / data-deletion address.
**This inbox must actually exist and be monitored** (a real mailbox or a
forwarding alias) before you publish — Oura/Garmin reviewers and users will use
it. If you'd rather use a different address, replace `privacy@tryrerun.com`
everywhere in both HTML files first.

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

- **No accounts / no login:** the app is single-operator with no user
  authentication, so the policy does not claim to collect names or passwords.
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
