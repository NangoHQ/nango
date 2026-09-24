exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "user_mfa_factors" ADD COLUMN IF NOT EXISTS "clock_offset_steps" INTEGER NOT NULL DEFAULT 0`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
