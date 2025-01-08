const tableName = '_nango_sync_data_records';

exports.up = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.index('model');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex('model');
    });
};
