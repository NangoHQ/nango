const JOBS_TABLE = '_nango_sync_jobs';

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.dropColumn('activity_log_id');
    });
};

exports.down = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.integer('activity_log_id').references('id').inTable('nango._nango_activity_logs').onDelete('SET NULL');
    });
};
