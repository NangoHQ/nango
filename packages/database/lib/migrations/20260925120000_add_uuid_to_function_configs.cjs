/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('function_configs', (table) => {
        table.uuid('uuid').notNullable().defaultTo(knex.raw('uuid_generate_v4()')).unique();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
