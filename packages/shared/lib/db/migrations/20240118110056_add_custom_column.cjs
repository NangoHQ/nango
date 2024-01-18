const tableName = 'nango._nango_configs';

exports.up = function(knex) {
    return knex.schema.table(tableName, function (table) {
        table.json('custom');
    });
};

exports.down = function(knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('custom');
    });
};
