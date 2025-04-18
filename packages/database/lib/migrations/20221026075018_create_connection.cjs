exports.up = function (knex) {
    return knex.schema.createTable('_nango_connections', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('provider_config_key').notNullable();
        table.string('connection_id').notNullable();
        table.json('credentials').notNullable();
        table.unique(['provider_config_key', 'connection_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_connections');
};
