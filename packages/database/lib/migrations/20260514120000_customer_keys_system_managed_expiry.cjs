exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE customer_keys
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS system_managed BOOLEAN NOT NULL DEFAULT FALSE;

        CREATE INDEX IF NOT EXISTS idx_customer_keys_system_managed_expires_at
            ON customer_keys (system_managed, expires_at)
            WHERE system_managed = TRUE;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS idx_customer_keys_system_managed_expires_at;

        ALTER TABLE customer_keys
            DROP COLUMN IF EXISTS expires_at,
            DROP COLUMN IF EXISTS system_managed;
    `);
};
