const tableName = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.string('input').nullable();
        table.string('sync_type').nullable();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('input');
        table.dropColumn('sync_type');
    });
};
