exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Create enum type
    await knex.raw(`DO $$
        BEGIN
            CREATE TYPE sync_config_code_source AS ENUM (
                'nango',
                'repo'
            );
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END
        $$`);
    // Add column
    await knex.raw(`ALTER TABLE _nango_sync_configs ADD COLUMN IF NOT EXISTS code_source sync_config_code_source NOT NULL DEFAULT 'repo'`);
    // Backfill
    await knex.raw(`UPDATE _nango_sync_configs SET code_source = 'nango' WHERE pre_built = true OR is_public = true`);
    // Drop default value
    await knex.raw(`ALTER TABLE _nango_sync_configs ALTER COLUMN code_source DROP DEFAULT`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs DROP COLUMN IF EXISTS code_source`);
    await knex.raw(`DROP TYPE IF EXISTS sync_config_code_source`);
};
