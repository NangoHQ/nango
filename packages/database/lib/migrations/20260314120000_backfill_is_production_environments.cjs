exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        UPDATE _nango_environments SET is_production = true WHERE name = 'prod' AND is_production = false
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        UPDATE _nango_environments SET is_production = false WHERE name = 'prod'
    `);
};
