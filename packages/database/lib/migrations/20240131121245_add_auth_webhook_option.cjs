const tableName = '_nango_environments';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.boolean('send_auth_webhook').defaultTo(false);
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('send_auth_webhook');
    });
};
