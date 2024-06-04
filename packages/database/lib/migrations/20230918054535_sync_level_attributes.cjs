const tableName = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.jsonb('attributes').defaultTo('{}');
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('attributes');
    });
};
