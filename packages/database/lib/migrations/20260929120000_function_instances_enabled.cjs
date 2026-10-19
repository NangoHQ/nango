/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('function_instances', (table) => {
        table.boolean('enabled').notNullable().defaultTo(true);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
