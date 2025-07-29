exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "end_users" ADD COLUMN "metadata" json;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
