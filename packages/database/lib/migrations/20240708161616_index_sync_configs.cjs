exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nango_sync_configs_active
            ON _nango_sync_configs USING BTREE (type, sync_name, nango_config_id)
            WHERE active = true`
    );
};
/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_nango_sync_configs_active');
};
