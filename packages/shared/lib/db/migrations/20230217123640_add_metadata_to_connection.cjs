exports.up = function (knex, _) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.jsonb('metadata');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.dropColumn('metadata');
    });
};
