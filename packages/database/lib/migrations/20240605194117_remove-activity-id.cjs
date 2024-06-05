exports.up = function (knex) {
    return knex.schema.alterTable('_nango_active_logs', function (table) {
        table.dropColumn('activity_log_id');
    });
};

exports.down = function () {};
