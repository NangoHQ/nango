/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "connect_sessions" ADD COLUMN "connection_id" int4`);

    await knex.raw(`ALTER TABLE "connect_sessions" ADD FOREIGN KEY ("connection_id") REFERENCES "_nango_connections" ("id")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "connect_sessions" DROP COLUMN "connection_id"`);
};
