/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
    // when the sync_config_id column was introduced,
    // it was populated with the correct values
    // however the sync_config_id must be updated every time a new version of a sync config is created
    // this migration will fix the sync_config_id column for all existing syncs
    return knex.raw(`
            UPDATE _nango_syncs AS syncs
            SET sync_config_id = sync_configs.id
            FROM _nango_sync_configs AS sync_configs
            JOIN _nango_connections AS connections ON sync_configs.nango_config_id = connections.config_id
            WHERE syncs.name = sync_configs.sync_name
              AND syncs.nango_connection_id = connections.id
              AND sync_configs.environment_id = connections.environment_id
              AND sync_configs.type = 'sync'
              AND sync_configs.active = true;
        `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {};
