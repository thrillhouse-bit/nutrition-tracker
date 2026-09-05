# Oathbearer Beta Release Checklist

The RPG ships as the exact hash route `/#control-tower-rpg` inside the existing
Docker/Render application. `render.yaml` defines the `nutrition-tracker` Render
service and `/api/health`; the repository does not contain evidence for a
separate Oathbearer host.

## Pre-merge gate

1. `node scripts/verify-oathbearer-beta.mjs --allow-untracked`
2. `npm run verify:oathbearer`
3. `npm test`
4. `git diff --check`
5. Commit the complete runtime, tests, contracts, and required assets.
6. `node scripts/verify-oathbearer-beta.mjs`

The default verifier intentionally fails while release-critical RPG files are
untracked. Passing tests in an unreproducible working tree is not a release.

## Delivery

Push the reviewed feature branch, merge it into the repository's protected
`main` branch, and let the Render service's declared `autoDeploy: true` build
the Docker image. Do not invent or manually overwrite Render secrets.

## Post-deploy smoke

1. `curl -fsS https://bodycurrent.app/api/health`
2. Open `https://bodycurrent.app/#control-tower-rpg` in a fresh browser.
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
