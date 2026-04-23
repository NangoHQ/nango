# Nango

## Database Migrations

Main database migrations live in `packages/database/lib/migrations/` (other services have their own migration directories). Before writing a new migration, read 2-3 recent ones to match the current style.

- **Naming**: `<YYYYMMDDHHMMSS>_<description>.cjs` (e.g. `20260420120000_create_customer_keys.cjs`)
- **No teardown**: `exports.down` is always an empty function — we never write rollback logic
- **Foreign keys use `ON DELETE CASCADE`**: child rows are cleaned up automatically when the parent is deleted
- **`exports.config = { transaction: false }`**: migrations run outside a transaction by default
