/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_connections" ADD COLUMN "end_user_id" int4`);
    await knex.raw(`ALTER TABLE "_nango_connections" ADD FOREIGN KEY ("end_user_id") REFERENCES "end_users" ("id") ON DELETE SET NULL`);

    await knex.raw(`ALTER TABLE "_nango_oauth_sessions" ADD COLUMN "connect_session_id" int4`);
    await knex.raw(`ALTER TABLE "_nango_oauth_sessions" ADD FOREIGN KEY ("connect_session_id") REFERENCES "connect_sessions" ("id") ON DELETE SET NULL`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_connections" DROP COLUMN "end_user_id"`);
    await knex.raw(`ALTER TABLE "_nango_oauth_sessions" DROP COLUMN "connect_session_id"`);
};
