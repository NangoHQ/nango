exports.up = async function (knex) {
    return knex.schema.createTable('_nango_environments', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('account_id').unsigned().references('id').inTable('_nango_accounts');
        table.string('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.uuid('public_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.string('secret_key_iv');
        table.string('secret_key_tag');
        table.unique('secret_key');
        table.unique('public_key');
        table.text('callback_url');
        table.text('webhook_url');
        table.boolean('hmac_enabled').defaultTo(false);
        table.string('hmac_key');
        table.timestamps(true, true);

        table.index('account_id');
        table.index('name');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_environments');
};
