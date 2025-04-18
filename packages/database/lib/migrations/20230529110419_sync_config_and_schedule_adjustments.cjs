const syncJobs = '_nango_sync_jobs';
const syncSchedules = '_nango_sync_schedules';

exports.up = async function (knex) {
    await knex.schema.alterTable(syncJobs, function (table) {
        table.specificType('models', 'text ARRAY');
        table.string('frequency');
    });

    await knex.schema.alterTable(syncSchedules, function (table) {
        table.integer('sync_job_id').references('id').inTable(syncJobs).onDelete('CASCADE');
        table.dropColumn('frequency');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(syncJobs, function (table) {
        table.dropColumn('models');
        table.dropColumn('frequency');
    });

    await knex.schema.alterTable(syncJobs, function (table) {
        table.string('frequency');
        table.dropColumn('sync_job_id');
    });
};
