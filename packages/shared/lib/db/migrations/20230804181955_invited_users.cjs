const DB_TABLE = '_nango_invited_users';

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.string('email').notNullable();
        table.integer('account_id').references('id').inTable('nango._nango_accounts').notNullable();
        table.integer('invited_by').references('id').inTable('nango._nango_users').notNullable();
        table.string('token').notNullable();
    });
};

exports.down = async function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(DB_TABLE);
};

