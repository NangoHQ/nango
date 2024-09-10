/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('_nango_syncs', function (table) {
            table.integer('sync_config_id').unsigned().references('id').inTable('_nango_sync_configs').onDelete('CASCADE');
        })
        .then(() => {
            return knex.raw(`
            UPDATE _nango_syncs AS syncs
            SET sync_config_id = sync_configs.id
            FROM _nango_sync_configs AS sync_configs
            JOIN _nango_connections AS connections ON sync_configs.nango_config_id = connections.config_id
            WHERE syncs.name = sync_configs.sync_name
              AND syncs.nango_connection_id = connections.id
              AND sync_configs.environment_id = connections.environment_id
              AND syncs.sync_config_id IS NULL;
        `);
        });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
    return knex.schema.alterTable('_nango_syncs', function (table) {
        table.dropColumn('sync_config_id');
    });
};
