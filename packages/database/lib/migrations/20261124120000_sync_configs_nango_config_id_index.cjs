exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_nango_sync_configs_nango_config_id"`);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nango_sync_configs_nango_config_id"
        ON "_nango_sync_configs" ("nango_config_id")`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
