const JOBS_TABLE = '_nango_sync_jobs';
const RECORDS_TABLE = '_nango_sync_data_records';
const CONFIGS_TABLE = '_nango_sync_configs';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(RECORDS_TABLE, function (table) {
        table.integer('sync_job_id').references('id').inTable(`nango.${JOBS_TABLE}`).onDelete('CASCADE').index();
    });

    await knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.integer('sync_config_id').references('id').inTable(`nango.${CONFIGS_TABLE}`).onDelete('CASCADE').index();
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(RECORDS_TABLE, function (table) {
        table.dropColumn('sync_job_id');
    });

    await knex.schema.withSchema('nango').alterTable(JOBS_TABLE, function (table) {
        table.dropColumn('sync_config_id');
    });
};


