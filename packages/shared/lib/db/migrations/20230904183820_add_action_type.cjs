const tableName = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.string('type').defaultTo('sync');
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('type');
    });
};
