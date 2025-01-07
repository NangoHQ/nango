const tableName = '_nango_sync_jobs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.index(['sync_id', 'deleted']);
        table.index('deleted');
        table.index('created_at');
        table.index('status');
        table.index('type');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex(['sync_id', 'deleted']);
        table.dropIndex('deleted');
        table.dropIndex('created_at');
        table.dropIndex('status');
        table.dropIndex('type');
    });
};
