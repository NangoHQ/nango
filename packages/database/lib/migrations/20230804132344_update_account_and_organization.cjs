const ACCOUNTS_TABLE = '_nango_accounts';
const USERS_TABLE = '_nango_users';

exports.up = async function (knex) {
    await knex.schema.alterTable(USERS_TABLE, function (table) {
        table.boolean('suspended').defaultTo(false).notNullable();
        table.dateTime('suspended_at').defaultTo(null);
    });
    return knex.schema.alterTable(ACCOUNTS_TABLE, function (table) {
        table.dropColumn('owner_id');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(USERS_TABLE, function (table) {
        table.dropColumn('suspended');
        table.dropColumn('suspended_at');
    });

    return knex.schema.alterTable(ACCOUNTS_TABLE, function (table) {
        table.integer('owner_id').references('id').inTable('_nango_users').defaultTo(0).notNullable();
    });
};
