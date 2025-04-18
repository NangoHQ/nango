const tableName = '_nango_configs';

exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, function (table) {
        table.text('oauth_client_secret').alter();
    });
    return knex.schema.table(tableName, function (table) {
        table.string('app_link');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(tableName, function (table) {
        table.string('oauth_client_secret', 255).alter();
    });
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('app_link');
    });
};
