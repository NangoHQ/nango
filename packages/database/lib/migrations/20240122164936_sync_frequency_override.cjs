const tableName = '_nango_syncs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.string('frequency');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.dropColumn('frequency');
    });
};
