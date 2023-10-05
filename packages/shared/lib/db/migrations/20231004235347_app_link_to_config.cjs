const tableName = '_nango_configs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.string('app_link');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropColumn('app_link');
    });
};
