const tableName = '_nango_sync_configs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.string('input').nullable();
        table.string('sync_type').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('input');
        table.dropColumn('sync_type');
    });
};
