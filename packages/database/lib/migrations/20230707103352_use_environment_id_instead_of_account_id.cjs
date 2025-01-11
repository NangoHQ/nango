/**
 * Use environment_id instead of account_id
 * @desc Wherever the account_id is used, replace it with the environment_id and
 * use the prod environment as the default environment
 */
const ENVIRONMENTS_TABLE = '_nango_environments';
const ACCOUNTS_TABLE = '_nango_accounts';

const TABLE_PREFIX = '_nango_';

exports.up = async function (knex) {
    const tablesToReplace = [
        { name: `${TABLE_PREFIX}activity_logs`, dropForeign: true, truncate: true },
        { name: `${TABLE_PREFIX}configs`, dropForeign: true, truncate: false },
        { name: `${TABLE_PREFIX}connections`, dropForeign: true, truncate: false },
        { name: `${TABLE_PREFIX}oauth_sessions`, dropForeign: false, truncate: false },
        { name: `${TABLE_PREFIX}sync_configs`, dropForeign: true, truncate: false }
    ];

    for (const tableObject of tablesToReplace) {
        const { name: tableToReplace, dropForeign, truncate } = tableObject;
        await knex.schema.alterTable(tableToReplace, function (table) {
            table.integer('environment_id').unsigned().references('id').inTable(`${TABLE_PREFIX}environments`).index();
        });

        if (truncate) {
            await knex.raw('TRUNCATE TABLE ?? CASCADE', [tableToReplace]);
        }

        const records = await knex.select('id', 'account_id').from(tableToReplace);

        for (const record of records) {
            const environment = await knex.select('id').from(ENVIRONMENTS_TABLE).where({
                account_id: record.account_id,
                name: 'prod'
            });
            await knex.update({ environment_id: environment[0].id }).from(tableToReplace).where({ id: record.id });
        }

        await knex.schema.alterTable(tableToReplace, function (table) {
            if (tableToReplace === `${TABLE_PREFIX}connections`) {
                table.dropUnique(['provider_config_key', 'connection_id', 'account_id']);
                table.unique(['provider_config_key', 'connection_id', 'environment_id']);
            }
            if (dropForeign) {
                table.dropForeign(['account_id']);
            }
            table.dropColumn('account_id');
        });
    }
};

exports.down = async function (knex) {
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
