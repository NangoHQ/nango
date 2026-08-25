/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('plans', 'remote_functions');
    if (hasColumn) {
        await knex.schema.alterTable('plans', (table) => {
            table.dropColumn('remote_functions');
        });
    }
};

exports.down = async function () {};

exports.config = { transaction: true };
