exports.config = { transaction: false };
const tableName = '_nango_accounts';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, (table) => {
        table.text('found_us').nullable();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('found_us');
    });
};
