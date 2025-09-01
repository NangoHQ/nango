exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "getting_started_progress" ADD COLUMN "closed" BOOLEAN NOT NULL DEFAULT FALSE`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
