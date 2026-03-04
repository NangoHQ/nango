# Slack connection ID migration

Migrates Slack notification connection IDs from the legacy name-based format
`account-{accountUUID}-{environmentName}` to the ID-based format
`account-{accountUUID}-{environmentId}`.

This is part of a three-step rollout:
1. **Dual lookup** — server tries new ID-based format first, falls back to legacy name-based
2. **Migration** — (this step) rename existing connections to the new format
3. **Cleanup** — remove the legacy fallback from the dual lookup

## Prerequisites

- `NANGO_ADMIN_UUID` — UUID of the admin account (required)
- `DATABASE_URL` — PostgreSQL connection string (e.g. `postgres://nango:nango@localhost:5432/nango`)
- Run all commands from the **repo root**

## Step 1 — Preview (run before migrating)

Generate the SQL and save a CSV of all connections that will be changed. Keep
this file safe — it is your manual rollback reference.

```bash
# Generate the preview SQL
NANGO_ADMIN_UUID=$(grep NANGO_ADMIN_UUID .env | cut -d= -f2-) \
  node -e "
    const { buildSlackConnectionIdPreviewSql } = require('./packages/database/lib/migration-helpers/migrateSlackConnectionIdSql.cjs');
    process.stdout.write(buildSlackConnectionIdPreviewSql())
  " > /tmp/slack_migration_preview.sql

# Save the results to a CSV
psql $DATABASE_URL -c "COPY ($(cat /tmp/slack_migration_preview.sql)) TO STDOUT WITH CSV HEADER" \
  > /tmp/slack_migration_preview.csv

cat /tmp/slack_migration_preview.csv
```

## Step 2 — Migrate

The migration runs automatically on deploy via the knex migration
`20260304120000_slack_connection_id_env_name_to_env_id.cjs`.

To run it manually:

```bash
# Run from repo root
NANGO_DATABASE_URL=postgres://nango:nango@localhost:5432/nango \
NANGO_ADMIN_UUID=$(grep NANGO_ADMIN_UUID .env | cut -d= -f2-) \
node -e "
  const knex = require('knex');
  const { getDbConfig } = require('./packages/database/dist/getConfig.js');
  const { buildSlackConnectionIdMigrationSql } = require('./packages/database/lib/migration-helpers/migrateSlackConnectionIdSql.cjs');
  const db = knex(getDbConfig({ timeoutMs: 60000 }));
  db.raw(buildSlackConnectionIdMigrationSql())
    .then(r => { console.log('done', r.rows[0]); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
"
```

## Step 3 — Revert (ad-hoc, if needed)

The knex `down` migration is a no-op: after step 1 (dual lookup) is deployed,
new connections are already created in the new format and are
indistinguishable from migrated ones — a blanket rollback would break them.

Use the CSV saved in step 1 to revert only the connections that were actually
migrated:

```bash
tail -n +2 /tmp/slack_migration_preview.csv | while IFS=, read -r id old new; do
  echo "UPDATE _nango_connections SET connection_id = '$old' WHERE id = $id;"
done | psql $DATABASE_URL
```

Inspect the generated SQL before running it by dropping the `| psql` part:

```bash
tail -n +2 /tmp/slack_migration_preview.csv | while IFS=, read -r id old new; do
  echo "UPDATE _nango_connections SET connection_id = '$old' WHERE id = $id;"
done
```
