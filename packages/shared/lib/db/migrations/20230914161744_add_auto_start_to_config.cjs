const tableName = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.boolean('auto_start').defaultTo(true);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('auto_start');
    });
};
