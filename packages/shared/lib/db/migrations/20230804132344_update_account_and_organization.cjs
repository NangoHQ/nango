const ACCOUNTS_TABLE = '_nango_accounts';
const USERS_TABLE = '_nango_users';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(USERS_TABLE, function (table) {
        table.boolean('suspended').defaultTo(false).notNullable();
        table.dateTime('suspended_at').defaultTo(null);
    });
    return knex.schema.withSchema('nango').alterTable(ACCOUNTS_TABLE, function (table) {
        table.dropColumn('owner_id');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(USERS_TABLE, function (table) {
        table.dropColumn('suspended');
        table.dropColumn('suspended_at');
    });

    return knex.schema.withSchema('nango').alterTable(ACCOUNTS_TABLE, function (table) {
        table.integer('owner_id').references('id').inTable('nango._nango_users').defaultTo(0).notNullable();
    });
};
