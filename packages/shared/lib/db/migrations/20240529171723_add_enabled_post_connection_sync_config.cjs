const TABLE_NAME = '_nango_sync_configs';

exports.up = function (knex, _) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.specificType('post_connection_scripts', 'text ARRAY');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.dropColumn('post_connection_scripts');
    });
};
