exports.config = { transaction: false };
const tableName = '_nango_configs';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, (table) => {
        table.string('oauth_client_id', 512).nullable().defaultTo(null).alter({ alterType: true });
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable(tableName, (table) => {
        table.string('oauth_client_id', 255).nullable().defaultTo(null).alter({ alterType: true });
    });
};
