const tableName = '_nango_environments';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.boolean('slack_notifications').defaultTo(false);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('slack_notifications');
    });
};
