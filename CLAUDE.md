# Nango

## Database Migrations

Main database migrations live in `packages/database/lib/migrations/` (other services have their own migration directories). Before writing a new migration, read 2-3 recent ones to match the current style.

- **Naming**: `<YYYYMMDDHHMMSS>_<description>.cjs` (e.g. `20260420120000_create_customer_keys.cjs`)
- **No teardown**: `exports.down` is always an empty function — we never write rollback logic
- **Foreign keys**: use `ON DELETE CASCADE` for ownership relationships (child cannot exist without parent). Use `ON DELETE SET NULL` for optional references where the child should survive parent deletion. Check existing migrations for the pattern that fits.
