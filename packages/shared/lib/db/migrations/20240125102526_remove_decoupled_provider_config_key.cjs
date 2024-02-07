const CONNECTIONS_TABLE = '_nango_connections';
const CONFIGS_TABLE = '_nango_configs';

exports.up = async function(knex) {
    await knex.schema.withSchema('nango').alterTable(CONNECTIONS_TABLE, function (table) {
        table.integer('nango_config_id').unsigned().references('id').inTable(`nango._nango_configs`).index();
    });

    const connections = await knex.select('id', 'provider_config_key', 'environment_id').from(`${CONNECTIONS_TABLE}`);

    for (const connection of connections) {
        const { id, provider_config_key, environment_id } = connection;
        const config = await knex.select('id').from(`${CONFIGS_TABLE}`).where({ unique_key: provider_config_key, environment_id }).first();
        await knex(`${CONNECTIONS_TABLE}`).where({ id }).update({ nango_config_id: config.id });
    }
};

exports.down = function(knex) {
    return knex.schema.withSchema('nango').alterTable(CONNECTIONS_TABLE, function (table) {
        table.dropColumn('nango_config_id');
    });
};
