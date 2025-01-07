const CONNECTIONS_TABLE = '_nango_connections';
const SYNCS_TABLE = '_nango_syncs';
const SYNC_CONFIGS_TABLE = '_nango_sync_configs';
const CONFIGS_TABLE = '_nango_configs';
const SYNC_JOBS_TABLE = '_nango_sync_jobs';
const SYNC_SCHEDULES_TABLE = '_nango_sync_schedules';

const tables = [CONNECTIONS_TABLE, SYNCS_TABLE, SYNC_CONFIGS_TABLE, CONFIGS_TABLE, SYNC_JOBS_TABLE, SYNC_SCHEDULES_TABLE];

exports.up = async function (knex) {
    for (const nangoTable of tables) {
        await knex.schema.alterTable(nangoTable, function (table) {
            table.boolean('deleted').defaultTo(false);
            table.dateTime('deleted_at').defaultTo(null);
        });
    }
};

exports.down = async function (knex) {
    for (const nangoTable of tables) {
        await knex.schema.alterTable(nangoTable, function (table) {
            table.dropColumn('deleted');
            table.dropColumn('deleted_at');
        });
    }
};
