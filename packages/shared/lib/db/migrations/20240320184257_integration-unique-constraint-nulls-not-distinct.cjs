exports.up = async function (knex) {
    return knex
        .raw('ALTER TABLE _nango_configs DROP CONSTRAINT IF EXISTS _nango_configs_unique_key_environment_id_deleted_at_unique')
        .then(() =>
            knex.raw(
                'ALTER TABLE _nango_configs ADD CONSTRAINT _nango_configs_unique_key_environment_id_deleted_at_unique UNIQUE NULLS NOT DISTINCT (unique_key, environment_id, deleted_at)'
            )
        )
        .then(() => knex.raw('ALTER TABLE _nango_connections DROP CONSTRAINT IF EXISTS _nango_connections_provider_config_key_connection_id_environmen'))
        .then(() =>
            knex.raw(
                'ALTER TABLE _nango_connections ADD CONSTRAINT _nango_connections_provider_config_key_connection_id_environmen UNIQUE NULLS NOT DISTINCT (provider_config_key, connection_id, environment_id, deleted_at)'
            )
        );
};

exports.down = async function () {};
