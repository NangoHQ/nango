/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" ADD COLUMN "api_rate_limit_size" varchar(4) NOT NULL DEFAULT 'm'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" DROP COLUMN "api_rate_limit_size"`);
};
