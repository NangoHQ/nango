# Connection Tags Migration Runbook

This script backfills `_nango_connections.tags` from `end_users` data using the same rules as `buildTagsFromEndUser`, then merges with existing tags (existing tags win).

Uses default database connection (connects to local Docker DB automatically).

## Run

Dry run (recommended first):

```bash
npx tsx scripts/one-off/connection-tags-migration/migrate.ts --dry-run
```

Execute the update:

```bash
npx tsx scripts/one-off/connection-tags-migration/migrate.ts
```

Execute the update and mark the migration as applied (cloud manual workflow):

```bash
npx tsx scripts/one-off/connection-tags-migration/migrate.ts --mark-migration
```

## Options

- `--dry-run` shows count of rows to update without making changes.
- `--mark-migration` records the migration in `_nango_auth_migrations` after a successful update.

## Output

- `Rows to update` indicates how many rows will be changed.
- `Updated rows` shows actual count after execution (unless dry run).
