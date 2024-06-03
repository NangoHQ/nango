const tableName = '_nango_activity_logs';

exports.up = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.index('session_id');
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex('session_id');
    });
};
