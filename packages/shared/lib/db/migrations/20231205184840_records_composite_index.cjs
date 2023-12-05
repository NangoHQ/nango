const tableName = '_nango_sync_data_records';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.index(['nango_connection_id', 'model', 'created_at', 'id'], 'idx_nango_records_composite');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropIndex(['nango_connection_id', 'model', 'created_at', 'id'], 'idx_nango_records_composite');
    });
};
