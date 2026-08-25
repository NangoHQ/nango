exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Create enum type
    await knex.raw(`DO $$
        BEGIN
            CREATE TYPE sync_config_source AS ENUM (
                'catalog',
                'standalone',
                'repo'
            );
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END
        $$`);
    // Add column with default so the backfill step works without requiring existing rows to be touched first
    await knex.raw(`ALTER TABLE _nango_sync_configs ADD COLUMN IF NOT EXISTS source sync_config_source NOT NULL DEFAULT 'repo'`);
    // Backfill: rows deployed from the Nango catalog get 'catalog'; everything else keeps 'repo'
    await knex.raw(`UPDATE _nango_sync_configs SET source = 'catalog' WHERE pre_built = true OR is_public = true`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs DROP COLUMN IF EXISTS source`);
    await knex.raw(`DROP TYPE IF EXISTS sync_config_source`);
};
