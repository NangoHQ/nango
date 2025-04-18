const tableName = '_nango_activity_log_messages';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.integer('environment_id').unsigned().references('id').inTable(`_nango_environments`).index();
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('environment_id');
    });
};
