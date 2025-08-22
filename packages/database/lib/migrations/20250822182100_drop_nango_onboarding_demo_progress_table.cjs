exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DROP TABLE IF EXISTS "_nango_onboarding_demo_progress"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
