# Aegean Frontier Vertical-Slice Preview Checklist

The RPG preview ships as the exact hash route `/#control-tower-rpg` inside the existing
Docker/Render application. `render.yaml` defines the `nutrition-tracker` Render
service and `/api/health`; the repository does not contain evidence for a
separate Aegean Frontier host.

This checklist is for a vertical-slice preview only. It never certifies a
complete-game release. That claim requires the manual **Complete-game release
gate** workflow and a passing legacy-compatible technical command,
`npm run verify:oathbearer:complete`.

## Pre-merge gate

1. Legacy-compatible technical command: `node scripts/verify-oathbearer-beta.mjs --allow-untracked`
2. Legacy-compatible technical command: `npm run verify:oathbearer`
3. `npm test`
4. `git diff --check`
5. Commit the complete runtime, tests, contracts, and required assets.
6. Legacy-compatible technical command: `node scripts/verify-oathbearer-beta.mjs`

The default verifier intentionally fails while release-critical RPG files are
untracked. Passing tests in an unreproducible working tree is not a release.

## Aegean legal-scope blocker — manual

Do not invite users to, deploy, or market the Aegean Frontier route as a
public/preview product until this section is complete. A working `/terms` or
`/privacy` route alone is not completion.

1. Record written, dated, versioned product-owner and counsel approval.
2. Confirm Aegean brand, operator, intended domain(s), and contact path.
3. Confirm account and gameplay-save/cache/cloud/export/deletion/restore scope.
4. Confirm telemetry/diagnostics and ads/analytics/no-sale claims.
5. Confirm virtual items/currency, trading/escrow, and purchase/real-money
   policy, including explicit absences.
6. Confirm minors/age treatment.
7. Confirm every actual third-party provider and processor.

If any item is unresolved, leave this as a release blocker; do not substitute
the OmniFuel nutrition/wearable templates or a generic account-consent screen.

## Preview delivery

Push the reviewed feature branch and merge it through the repository's protected
`main` branch only for a general/preview deployment. Render auto-deploy is
disabled: deploy manually as a preview, or use the explicit complete-release
path only after its manual CI gate passes. Do not invent or manually overwrite
Render secrets.

For a complete-game release, do not use this checklist or direct Compose
commands. Dispatch the manual **Complete-game release gate** workflow, retain
its JSON report, then use `./deploy.sh --complete-release` under the separately
authorized deployment procedure. Complete-release mode rejects staged,
unstaged, or untracked working-tree changes; commit the reviewed release first.

## Post-deploy smoke

1. `curl -fsS https://omnifuelapp.tech/api/health`
2. Open `https://omnifuelapp.tech/#control-tower-rpg` in a fresh browser.
3. Start a story, click across Beacon Overlook, and verify Kallias visibly
   accelerates, alternates weight, turns in both directions, and settles.
4. Verify WASD, touch controls, Pause/Resume, Thessa dialogue, shrine patron
   selection, an encounter's explicit Begin gate, Pack, Systems, and Continue.
5. Confirm `/`, `/#control-tower`, and the nutrition/API surfaces still load.

## Rollback

If the health check or RPG smoke fails, use Render's deployment history to
redeploy the last healthy image, then revert the merge commit on `main`. Do not
delete the failed deployment or rewrite shared Git history; retain its logs and
commit SHA for diagnosis.
