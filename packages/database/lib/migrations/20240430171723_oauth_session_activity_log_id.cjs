exports.up = function (knex) {
    return knex.schema.alterTable('_nango_oauth_sessions', function (table) {
        table.string('activity_log_id');
    });
};

exports.down = function (knex) {
    return knex.schema.table('_nango_oauth_sessions', function (table) {
        table.dropColumn('activity_log_id');
    });
};
