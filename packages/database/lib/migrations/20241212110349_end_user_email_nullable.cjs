/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "end_users" ALTER COLUMN "email" DROP NOT NULL`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "end_users" ALTER COLUMN "email" SET NOT NULL;`);
};
