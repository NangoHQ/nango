const JOBS_TABLE = '_nango_sync_jobs';

exports.up = async function (knex) {
    return knex.schema.alterTable(JOBS_TABLE, function (table) {
        table.string('run_id');
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(JOBS_TABLE, function (table) {
        table.dropColumn('run_id');
    });
};
