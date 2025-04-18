exports.up = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.jsonb('metadata');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.dropColumn('metadata');
    });
};
