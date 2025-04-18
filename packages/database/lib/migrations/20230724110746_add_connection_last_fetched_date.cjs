const tableName = '_nango_connections';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.dateTime('last_fetched_at');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('last_fetched_at');
    });
};
