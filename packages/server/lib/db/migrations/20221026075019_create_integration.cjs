exports.up = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).createTable('_pizzly_integrations', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('unique_key').notNullable();
        table.string('type').notNullable();
        table.string('oauth_client_id');
        table.string('oauth_client_secret');
        table.string('oauth_scopes');
        table.unique('unique_key');
    });
};

exports.down = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).dropTable('_pizzly_integrations');
};
