/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" ADD COLUMN "api_rate_limit_points" int4 NOT NULL DEFAULT 1000`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" DROP COLUMN "api_rate_limit_points"`);
};
