const TABLE_NAME = '_nango_sync_jobs';

exports.up = function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.integer('activity_log_id').references('id').inTable('_nango_activity_logs').onDelete('SET NULL');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.dropColumn('activity_log_id');
    });
};
