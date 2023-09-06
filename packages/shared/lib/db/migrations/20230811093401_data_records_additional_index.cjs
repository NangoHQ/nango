const tableName = '_nango_sync_data_records';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.index('external_deleted_at');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropIndex('external_deleted_at');
    });
};

