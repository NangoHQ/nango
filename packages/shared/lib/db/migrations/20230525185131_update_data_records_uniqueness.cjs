const tableName = '_nango_sync_data_records';

exports.up = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropUnique(['nango_connection_id', 'external_id']);
        table.unique(['nango_connection_id', 'external_id', 'model']);
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropUnique(['nango_connection_id', 'external_id', 'model']);
        table.unique(['nango_connection_id', 'external_id']);
    });
};
