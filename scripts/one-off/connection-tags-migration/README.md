# Connection Tags Migration Runbook

Uses .env to figure out the DB connection

## Run

Execute the update:

```bash
npx tsx scripts/one-off/connection-tags-migration/migrate.ts
```

Execute the update and mark the migration as applied (cloud manual workflow):

```bash
npx tsx scripts/one-off/connection-tags-migration/migrate.ts --mark-migration
```

## Options

- `--mark-migration` records the migration in `_nango_auth_migrations` after a successful update.

## Output

- `Updated rows` shows actual count after execution.
