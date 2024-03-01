const tableName = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.boolean('track_deletes').defaultTo(false);
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('track_deletes');
    });
};
