const SYNCS_TABLE = '_nango_syncs';

exports.up = async function (knex) {
    return knex.schema.alterTable(SYNCS_TABLE, function (table) {
        table.dateTime('last_sync_date').nullable();
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(SYNCS_TABLE, function (table) {
        table.dropColumn('last_sync_date');
    });
};
