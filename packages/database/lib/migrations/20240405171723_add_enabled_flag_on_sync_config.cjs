const tableName = '_nango_sync_configs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.boolean('enabled').defaultTo(true);
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('enabled');
    });
};
