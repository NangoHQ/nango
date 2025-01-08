const tableName = '_nango_sync_data_records';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.index('external_deleted_at');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex('external_deleted_at');
    });
};
