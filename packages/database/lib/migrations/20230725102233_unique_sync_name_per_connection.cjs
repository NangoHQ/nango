const SYNCS_TABLE = '_nango_syncs';

exports.up = async function (knex) {
    return knex.schema.alterTable(SYNCS_TABLE, function (table) {
        table.unique(['name', 'nango_connection_id', 'deleted_at']);
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(SYNCS_TABLE, function (table) {
        table.dropUnique(['name', 'nango_connection_id', 'deleted_at']);
    });
};
