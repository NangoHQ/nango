const tableName = '_nango_sync_data_records';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.boolean('pending_delete').defaultTo(false).index();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('pending_delete');
    });
};


