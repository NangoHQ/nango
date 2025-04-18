const CONNECTIONS_TABLE = '_nango_connections';
const CONFIGS_TABLE = '_nango_configs';

exports.up = async function (knex) {
    await knex.schema.alterTable(CONNECTIONS_TABLE, function (table) {
        table.dropUnique(['provider_config_key', 'connection_id', 'environment_id']);
        table.unique(['provider_config_key', 'connection_id', 'environment_id', 'deleted_at']);
    });

    return knex.schema.alterTable(CONFIGS_TABLE, function (table) {
        table.unique(['unique_key', 'environment_id', 'deleted_at']);
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(CONNECTIONS_TABLE, function (table) {
        table.unique(['provider_config_key', 'connection_id', 'environment_id']);
        table.dropUnique(['provider_config_key', 'connection_id', 'environment_id', 'deleted_at']);
    });

    return knex.schema.alterTable(CONFIGS_TABLE, function (table) {
        table.dropUnique(['unique_key', 'environment_id', 'deleted_at']);
    });
};
