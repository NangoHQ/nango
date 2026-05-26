---
name: creating-database-migrations
description: Use when adding or editing Nango database migrations - covers migration directory selection, timestamped .cjs naming, matching recent migration style, down migration decisions, and foreign key ON DELETE conventions.
---

# Creating Database Migrations

## Workflow

1. Identify the right migration directory.
   - Main database migrations live in `packages/database/lib/migrations/`.
   - Other services may have their own migration directories; use the directory for the service being changed.

2. Before writing a migration, read 2-3 recent migrations in the same directory and follow their style.

3. Name new main database migrations with the timestamped CommonJS format:

   ```text
   <YYYYMMDDHHMMSS>_<description>.cjs
   ```

   Example:

   ```text
   20260420120000_create_customer_keys.cjs
   ```

4. Decide `exports.down` explicitly.
   - Ask the user whether rollback logic should be included or `exports.down` should be left empty.
   - If the user already specified rollback behavior, follow that direction.

5. Choose foreign key delete behavior from the relationship:
   - Use `ON DELETE CASCADE` for ownership relationships where the child cannot exist without the parent.
   - Use `ON DELETE SET NULL` for optional references where the child should survive parent deletion.
   - Check existing migrations for the closest matching relationship before choosing.

## Review Checklist

- [ ] Migration is in the correct service migration directory.
- [ ] Filename uses the timestamped `.cjs` migration format.
- [ ] Style matches recent migrations in the same directory.
- [ ] `exports.down` behavior was confirmed or explicitly requested.
- [ ] Foreign keys use `CASCADE` for ownership and `SET NULL` for optional references.
