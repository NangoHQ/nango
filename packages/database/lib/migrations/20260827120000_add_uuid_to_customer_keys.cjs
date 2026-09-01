exports.config = { transaction: false };

const tableName = 'customer_keys';
const notNullConstraintName = `${tableName}_uuid_not_null`;
const uniqueIndexName = `${tableName}_uuid_unique`;

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS uuid UUID`);
    await knex.raw(`ALTER TABLE ${tableName} ALTER COLUMN uuid SET DEFAULT uuid_generate_v4()`);

    await knex(tableName)
        .whereNull('uuid')
        .update({ uuid: knex.raw('uuid_generate_v4()') });

    await addUuidNotNullConstraint(knex);

    await knex.raw(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${uniqueIndexName} ON ${tableName} (uuid)`);
};

/**
 * Adds a `NOT NULL` constraint to the new `uuid` column, avoiding holding an ACCESS EXCLUSIVE lock
 * while the table is scanned to prove the constraint. The operation is retry-safe.
 *
 * Steps:
 * 1. Add a CHECK constraint with initial NOT VALID state. This will take on ACCESS EXCLUSIVE, but only
 *   briefly once acquired.
 * 2. Validate the constraint. This allows concurrent reads/writes while it runs.
 * 3. Mark the column NOT NULL. This will again take on ACCESS EXCLUSIVE, but it will be fast as it
 *   won't have to scan the table to prove the constraint; it is already proven and it can rely on it.
 */
async function addUuidNotNullConstraint(knex) {
    const existingColumn = await knex.raw(
        `
        SELECT attnotnull
        FROM pg_attribute
        WHERE attrelid = ?::regclass AND attname = 'uuid' AND NOT attisdropped`,
        [tableName]
    );

    // No need to add the constraint; the `uuid` column is already `NOT NULL`.
    if (existingColumn.rows[0]?.attnotnull) {
        return;
    }

    await knex.raw(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = '${tableName}'::regclass
                  AND conname = '${notNullConstraintName}'
            ) THEN
                ALTER TABLE ${tableName}
                    ADD CONSTRAINT ${notNullConstraintName}
                    CHECK (uuid IS NOT NULL) NOT VALID;
            END IF;
        END $$;
    `);

    await knex.raw(`ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${notNullConstraintName}`);
    await knex.raw(`ALTER TABLE ${tableName} ALTER COLUMN uuid SET NOT NULL`);
    await knex.raw(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${notNullConstraintName}`);
}

exports.down = async function () {};
