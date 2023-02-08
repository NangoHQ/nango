exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable('_nango_accounts', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.uuid('secret_key').defaultTo(knex.raw('get_random_uuid()')).notNullable();
        table.uuid('public_key').defaultTo(knex.raw('get_random_uuid()')).notNullable();
        table.string('email').notNullable();
        table.unique('secret_key');
        table.unique('public_key');
        table.unique('email');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable('_nango_accounts');
};
