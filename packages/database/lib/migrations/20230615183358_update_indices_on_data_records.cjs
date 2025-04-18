const tableName = '_nango_sync_data_records';

exports.up = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.index('data_hash');
        table.index('external_id');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex('data_hash');
        table.dropIndex('external_id');
    });
};
