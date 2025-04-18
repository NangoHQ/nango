const syncs = '_nango_syncs';
const syncJobs = '_nango_sync_jobs';
const syncSchedules = '_nango_sync_schedules';
const syncDataRecords = '_nango_sync_data_records';

exports.up = async function (knex) {
    await knex.schema.createTable(syncs, function (table) {
        table.uuid('id').primary().notNullable();
        table.integer('nango_connection_id').unsigned().notNullable();
        table.string('name').notNullable();
        table.specificType('models', 'text ARRAY');

        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
        table.timestamps(true, true);
    });

    await knex.schema.alterTable(syncJobs, function (table) {
        table.uuid('sync_id').references('id').inTable(syncs).onDelete('CASCADE');
        table.dropColumn('nango_connection_id');
        table.dropColumn('sync_name');
        table.dropColumn('models');
        table.dropColumn('frequency');
        table.string('job_id');
        table.jsonb('result').defaultTo('{}');
    });

    await knex.schema.alterTable(syncSchedules, function (table) {
        table.uuid('sync_id').references('id').inTable(syncs).onDelete('CASCADE');
        table.string('frequency');
        table.dropColumn('sync_job_id');
        table.dropColumn('nango_connection_id');
    });

    await knex.schema.alterTable(syncDataRecords, function (table) {
        table.uuid('sync_id').references('id').inTable(syncs).onDelete('CASCADE');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(syncJobs, function (table) {
        table.dropColumn('sync_id');
        table.integer('nango_connection_id').unsigned().notNullable();
        table.string('sync_name').notNullable();
        table.specificType('models', 'text ARRAY');
        table.string('frequency');
        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
        table.dropColumn('result');
    });

    await knex.schema.alterTable(syncSchedules, function (table) {
        table.dropColumn('sync_id');
        table.integer('nango_connection_id').unsigned().notNullable();
        table.dropColumn('frequency');
        table.integer('sync_job_id').references('id').inTable(syncJobs).onDelete('CASCADE');
        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
    });

    await knex.schema.alterTable(syncDataRecords, function (table) {
        table.dropColumn('sync_id');
    });

    await knex.schema.dropTable(syncs);
};
