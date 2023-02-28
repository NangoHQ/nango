exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').createTable('_nango_users', function (table) {
        table.increments('id').primary();
        table.timestamps(true, true);
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.string('hashed_password').notNullable();
        table.string('salt').notNullable();
        table.integer('account_id').references('id').inTable('nango._nango_accounts').notNullable();
        table.unique('email');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable('_nango_users');
};
