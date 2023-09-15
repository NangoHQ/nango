const JOBS_TABLE = '_nango_sync_jobs';

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.string('run_id');
    });
};

exports.down = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.dropColumn('run_id');
    });
};
