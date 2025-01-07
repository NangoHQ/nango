const tableName = '_nango_sync_configs';
const syncs = '_nango_syncs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.uuid('sync_id').references('id').inTable(syncs).onDelete('CASCADE');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.dropColumn('sync_id');
    });
};
