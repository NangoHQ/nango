/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "connect_sessions" ADD COLUMN "operation_id" varchar(255)`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "connect_sessions" DROP COLUMN "operation_id"`);
};
