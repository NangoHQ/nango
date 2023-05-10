exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.jsonb('connection_config');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.dropColumn('connection_config');
    });
};
