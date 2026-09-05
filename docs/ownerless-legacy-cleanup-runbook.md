# Ownerless legacy-data cleanup

This is a one-time, operator-owned recovery workflow for rows created before
account ownership existed. It never assigns those rows to a newly created user:
there is no defensible way to infer an owner. Signup remains closed while such
rows exist.

Use a production `DATABASE_URL`; the tool refuses the JSON development store.
Before execution, take a full database dump and verify restoration into an
isolated database. Quiesce application/background writes until the cleanup
receipt is verified: the Neon HTTP backup collection and delete transaction
are separate requests, so maintenance mode is required to prevent rows arriving
between them. This tool is not a replacement for the full database backup.
First make a read-only receipt:

```bash
node scripts/ownerless-legacy-cleanup.mjs --preview --receipt /secure/path/ownerless-preview.json
```

Review the per-table counts and SHA-256 in that receipt. To execute, provide a
new, access-restricted backup location and the deliberately cumbersome
confirmation:

```bash
node scripts/ownerless-legacy-cleanup.mjs --execute --confirm-ownerless-cleanup \
  --backup /secure/path/ownerless-backup.json \
  --receipt /secure/path/ownerless-executed.json
```

The backup and receipt are created with mode `0600`; neither row data nor
tokens are printed. The backup can include provider OAuth tokens from an
orphaned account, so retain it as a production secret, according to the
incident/retention policy. The execute receipt is written only after a second
read proves the selected tables contain zero ownerless rows. Do not enable
invites based only on a preview receipt; use the execute receipt and keep it
with the release record.

The backup captures `log_entries`, `daily_targets`, `oura_accounts` plus
`oura_workouts`, `garmin_accounts` plus `garmin_dailies`, `wearable_signals`,
and `daily_plans` before the account deletes trigger their cascades. It does
not delete any named user or shared food-cache data. Recovery is deliberately
not an automatic script: restore the verified backup through the reviewed
production incident procedure in parent-before-child order.

For recovery, prefer the verified full database dump restored to an isolated
database first. For selective JSON recovery, validate the backup SHA against the
receipt, restore parent accounts before workouts/dailies, retain original IDs
(identity columns need `OVERRIDING SYSTEM VALUE`), and reset identity sequences
above the restored maximum. Validate counts and foreign keys before resuming.
Never place the backup in the repository, a public download directory, or logs.
