const TABLE = '_nango_sync_configs';

exports.up = async function (knex) {
    await knex.schema.alterTable(TABLE, function (table) {
        table.dropColumn('integration_name');
        table.string('version').notNullable();
        table.specificType('models', 'text ARRAY');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(TABLE, function (table) {
        table.string('integration_name');
        table.dropColumn('version');
        table.dropColumn('models');
    });
};
