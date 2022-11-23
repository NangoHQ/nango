exports.up = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).createTable('_pizzly_integrations', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('integration_id').NotNullable();
        table.string('type').NotNullable();
        table.string('oauth_client_id');
        table.string('oauth_client_secret');
        table.string('oauth_scopes');
        table.unique('integration_id');
    });
};

exports.down = function (knex, _) {
    var schema = process.env['PIZZLY_DB_SCHEMA'] || 'pizzly';
    return knex.schema.withSchema(schema).dropTable('_pizzly_integrations');
};
