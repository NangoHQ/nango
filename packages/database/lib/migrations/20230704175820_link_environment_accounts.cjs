/**
 * Link environment accounts
 * @desc iterate over existing accounts and copy that data to the prod linked account
 * After this remove the fields from the accounts table
 */
const ENVIRONMENTS_TABLE = '_nango_environments';
const ACCOUNTS_TABLE = '_nango_accounts';

exports.up = async function (knex) {
    const existingAccounts = await knex.table(ACCOUNTS_TABLE).select('*');

    for (const account of existingAccounts) {
        await knex.table(ENVIRONMENTS_TABLE).insert({
            account_id: account.id,
            name: 'prod',
            secret_key: account.secret_key,
            public_key: account.public_key,
            secret_key_iv: account.secret_key_iv,
            secret_key_tag: account.secret_key_tag,
            callback_url: account.callback_url,
            webhook_url: account.webhook_url
        });

        await knex.table(ENVIRONMENTS_TABLE).insert({
            account_id: account.id,
            name: 'dev'
        });
    }

    return knex.schema.alterTable(ACCOUNTS_TABLE, function (table) {
        table.dropColumn('secret_key');
        table.dropColumn('public_key');
        table.dropColumn('secret_key_iv');
        table.dropColumn('secret_key_tag');
        table.dropColumn('callback_url');
        table.dropColumn('webhook_url');
    });
};

exports.down = async function (knex) {
    await knex.table('_nango_environments').truncate();

    return knex.schema.alterTable(ACCOUNTS_TABLE, function (table) {
        table.uuid('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.uuid('public_key').defaultTo(knex.raw('uuid_generate_v4()')).notNullable();
        table.string('secret_key_iv');
        table.string('secret_key_tag');
        table.text('callback_url');
        table.text('webhook_url');

        table.unique('secret_key');
        table.unique('public_key');
    });
};
