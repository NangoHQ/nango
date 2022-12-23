exports.up = function (knex, _) {
    return knex.schema.withSchema('pizzly').createTable('_pizzly_configs', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('unique_key').notNullable();
        table.string('provider').notNullable();
        table.string('oauth_client_id').notNullable();
        table.string('oauth_client_secret').notNullable();
        table.string('oauth_scopes').notNullable();
        table.unique('unique_key');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('pizzly').dropTable('_pizzly_configs');
};
