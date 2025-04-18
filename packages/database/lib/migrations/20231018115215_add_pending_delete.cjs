const tableName = '_nango_sync_data_records';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.boolean('pending_delete').defaultTo(false).index();
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('pending_delete');
    });
};
