exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "connect_sessions" ADD COLUMN "end_user" json`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
