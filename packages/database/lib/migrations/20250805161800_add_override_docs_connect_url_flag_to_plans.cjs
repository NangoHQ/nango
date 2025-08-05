exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('can_override_docs_connect_url').defaultTo(false);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.dropColumn('can_override_docs_connect_url');
    });
};
