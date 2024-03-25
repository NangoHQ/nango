const tableName = '_nango_users';

exports.up = function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.string('external_id').nullable().index();
    });
};

exports.down = function (knex, _) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('external_id');
    });
};
