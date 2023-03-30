exports.up = function(knex, _) {
    return knex.schema.withSchema('nango').createTable('_nango_oauth_sessions', function(table) {
        table.uuid('id').notNullable();
        table.string('providerConfigKey').notNullable();
        table.string('provider').notNullable();
        table.string('connectionId').notNullable();
        table.string('callbackUrl').notNullable();
        table.string('authMode').notNullable();
        table.string('codeVerifier');
        table.json('connectionConfig');
        table.string('accountId');
        table.string('webSocketClientId');
        table.string('codeVerifier');
        table.string('request_token_secret');
        table.timestamps(true, true);

        table.unique('id');
    });
};

exports.down = function(knex, _) {
    return knex.schema.withSchema('nango').dropTable('_nango_oauth_sessions');
};
