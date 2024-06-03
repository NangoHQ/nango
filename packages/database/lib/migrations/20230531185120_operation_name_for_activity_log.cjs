const TABLE_NAME = '_nango_activity_logs';

exports.up = function (knex, _) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.string('operation_name');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.dropColumn('operation_name');
    });
};
