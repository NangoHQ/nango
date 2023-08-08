const DB_TABLE = '_nango_invited_users';

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.integer('account_id').references('id').inTable('nango._nango_accounts').notNullable();
        table.integer('invited_by').references('id').inTable('nango._nango_users').notNullable();
        table.string('token').notNullable();
        table.dateTime('expires_at').notNullable();
        table.boolean('accepted').defaultTo(false);
        table.timestamps(true, true);
    });
};

exports.down = async function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(DB_TABLE);
};

