exports.up = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).createTable('_pizzly_connections', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('integration').notNullable();
        table.string('connection_id').notNullable();
        table.json('credentials').notNullable();
        table.json('raw_response').notNullable();
        table.unique(['integration', 'connection_id']);
    });
};

exports.down = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).dropTable('_pizzly_connections');
};
