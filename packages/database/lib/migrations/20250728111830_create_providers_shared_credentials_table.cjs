/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    return knex.schema.createTable('providers_shared_credentials', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.json('credentials').notNullable();
        table.timestamps(true, true);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
