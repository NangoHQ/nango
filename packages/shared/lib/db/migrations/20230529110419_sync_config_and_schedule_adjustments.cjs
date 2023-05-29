const syncJobs = '_nango_sync_jobs';
const syncSchedules = '_nango_sync_schedules';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(syncJobs, function (table) {
        table.specificType('models', 'text ARRAY');
        table.string('frequency');
    });

    await knex.schema.withSchema('nango').alterTable(syncSchedules, function (table) {
        table.integer('sync_job_id').references('id').inTable(`nango.${syncJobs}`).onDelete('CASCADE');
        table.dropColumn('frequency');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(syncJobs, function (table) {
        table.dropColumn('models');
        table.dropColumn('frequency');
    });

    await knex.schema.withSchema('nango').alterTable(syncJobs, function (table) {
        table.string('frequency');
        table.dropColumn('sync_job_id');
    });
};

