# Body Current identity and compatibility

All consumer product copy uses **Body Current**. The approved icon is
`public/body-current-master.png`. Native app/watch display names and the PWA
manifest also use Body Current. Oathbearer is a separate product and keeps its name.

The remaining former-brand strings are deliberate compatibility identifiers:

| Identifier | Remaining locations | Reason and future migration |
| --- | --- | --- |
| `omnifuelapp.tech` | Production URL examples, legal link targets, agent default origin, science policy URL, deployment configuration examples and historical verification reports | This is the working owned host, including existing Oura callbacks. A new domain requires ownership, DNS/TLS, provider callback registration, origin/session/CORS checks, and redirects. Do not invent a domain or interrupt Oura to change spelling. Legal link text uses Body Current or the policy title. |
| `OMNIFUEL_A2A_TOKEN`, `OMNIFUEL_PUBLIC_URL` | `server/agent.js`, compatibility tests and operational documentation | Existing deployments keep working. New preferred aliases are `BODY_CURRENT_A2A_TOKEN` and `BODY_CURRENT_PUBLIC_URL`; when set they take precedence. Migrate secret configuration before retiring old aliases. |
| `service: 'omnifuel'`, `omnifuel-status` | Agent API response and A2A artifact, compatibility test | Existing machine clients may match these values. New metadata exposes `displayName: 'Body Current'` and `serviceId: 'body-current'`. Retire old machine values only with a versioned client migration. |
| `omnifuel-alpha-invite` | `server/alphaAccess.js` | Persistent invite hashing namespace. Changing it would invalidate issued/used invite matching. Keep until a dual-version hash migration is implemented and tested. |
| Former brand matcher | `test/body-current-brand.test.js` | Regression check that rejects the former consumer brand. |

Internal `Fuel*` Swift symbols, filenames, project identifiers and persistence
keys are implementation names, not displayed branding. Native display labels are
Body Current. Keep stable persistence/widget identifiers to avoid losing existing
data or installed widgets. Ordinary “fuel,” “fueling,” and “Daily Fuel Plan” describe
nutrition functionality and are intentional product vocabulary.

The release uses PWA automatic service-worker updates and outdated-cache cleanup.
An existing browser tab showed old cached branding until a normal reload, which
successfully loaded Body Current. Ask existing installed users to refresh/reopen;
do not clear their account data as a branding update step.
