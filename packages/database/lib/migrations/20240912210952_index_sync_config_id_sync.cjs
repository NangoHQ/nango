exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_config_id_where_deleted"
            ON "_nango_syncs" USING BTREE ("sync_config_id")
            WHERE deleted = false`
    );
};
/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_sync_config_id_where_deleted');
};
