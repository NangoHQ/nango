exports.up = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.jsonb('connection_config');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.dropColumn('connection_config');
    });
};
