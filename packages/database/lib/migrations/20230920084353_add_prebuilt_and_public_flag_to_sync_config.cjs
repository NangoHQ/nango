const tableName = '_nango_sync_configs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.boolean('pre_built').defaultTo(false);
        table.boolean('is_public').defaultTo(false);
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('pre_built');
        table.dropColumn('is_public');
    });
};
