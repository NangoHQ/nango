const TABLE_NAME = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(TABLE_NAME, function (table) {
        table.jsonb('webhook_subscriptions');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(TABLE_NAME, function (table) {
        table.dropColumn('webhook_subscriptions');
    });
};
