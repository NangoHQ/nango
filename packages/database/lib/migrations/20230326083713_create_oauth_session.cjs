exports.up = function (knex) {
    return knex.schema.createTable('_nango_oauth_sessions', function (table) {
        table.uuid('id').notNullable();
        table.string('provider_config_key').notNullable();
        table.string('provider').notNullable();
        table.string('connection_id').notNullable();
        table.string('callback_url').notNullable();
        table.string('auth_mode').notNullable();
        table.bigint('account_id').notNullable();
        table.json('connection_config');
        table.string('web_socket_client_id');
        table.string('code_verifier');
        table.string('request_token_secret');
        table.timestamps(true, true);

        table.unique(['id']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_oauth_sessions');
};
