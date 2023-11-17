const tableName = '_nango_syncs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function (table) {
        table.index(['nango_connection_id', 'deleted'], 'nango_syncs_nango_connection_id_deleted_index');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').table(tableName, function (table) {
        table.dropIndex('nango_syncs_nango_connection_id_deleted_index');
    });
};
