const tableName = '_nango_syncs';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.index(['nango_connection_id', 'deleted'], 'nango_syncs_nango_connection_id_deleted_index');
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropIndex('nango_syncs_nango_connection_id_deleted_index');
    });
};
