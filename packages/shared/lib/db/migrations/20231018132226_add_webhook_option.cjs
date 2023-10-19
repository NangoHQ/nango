const tableName = '_nango_environments';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.boolean('always_send_webhook').defaultTo(false);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('always_send_webhook');
    });
};
