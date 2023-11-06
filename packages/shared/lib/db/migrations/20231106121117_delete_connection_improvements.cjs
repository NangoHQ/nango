const SYNC_TABLE = '_nango_syncs';
const SYNC_RECORDS_TABLE = '_nango_sync_data_records';
const SYNC_RECORDS_DELETE_TABLE = '_nango_sync_data_records_deletes';
const SYNC_SCHEDULE_TABLE = '_nango_sync_schedules';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(SYNC_RECORDS_DELETE_TABLE, function (table) {
        table.index('sync_id');
    });

    await knex.schema.withSchema('nango').alterTable(SYNC_RECORDS_TABLE, function (table) {
        table.index('sync_id');
    });

    await knex.schema.withSchema('nango').alterTable(SYNC_SCHEDULE_TABLE, function (table) {
        table.index(['sync_id', 'deleted'], 'nango_sync_schedules_sync_id_deleted_index');
    });

    return knex.schema.withSchema('nango').alterTable(SYNC_TABLE, function (table) {
        table.index(['id', 'deleted'], 'nango_syncs_id_deleted_index');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').table(SYNC_RECORDS_DELETE_TABLE, function (table) {
        table.dropIndex('sync_id');
    });

    await knex.schema.withSchema('nango').table(SYNC_RECORDS_TABLE, function (table) {
        table.dropIndex('sync_id');
    });

    await knex.schema.withSchema('nango').table(SYNC_SCHEDULE_TABLE, function (table) {
        table.dropIndex('nango_sync_schedules_sync_id_deleted_index');
    });

    return knex.schema.withSchema('nango').table(SYNC_TABLE, function (table) {
        table.dropIndex('nango_syncs_id_deleted_index');
    });
};
