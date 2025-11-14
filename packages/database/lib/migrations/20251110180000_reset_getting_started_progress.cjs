exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw('TRUNCATE TABLE getting_started_progress, getting_started_meta RESTART IDENTITY');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
