exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS function_duration_seconds_max INTEGER
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
