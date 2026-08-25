/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('remote_functions').notNullable().defaultTo(false);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.dropColumn('remote_functions');
    });
};

exports.config = { transaction: true };
