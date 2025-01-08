exports.up = async function (knex) {
    return knex.schema.createTable('_nango_users', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.string('hashed_password').notNullable().defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('salt').notNullable().defaultTo(knex.raw('uuid_generate_v4()'));
        table.integer('account_id').references('id').inTable('_nango_accounts').notNullable();
        table.unique('email');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_users');
};
