exports.up = async function (knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    return knex.schema.createTable('_nango_accounts', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.uuid('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.uuid('public_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.string('email').notNullable();
        table.unique('secret_key');
        table.unique('public_key');
        table.unique('email');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_accounts');
};
