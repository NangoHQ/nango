exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS function_runtime function_runtime NOT NULL DEFAULT 'lambda'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
