exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('connect_sessions', (table) => {
        table.jsonb('overrides').nullable();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('connect_sessions', (table) => {
        table.dropColumn('overrides');
    });
};
