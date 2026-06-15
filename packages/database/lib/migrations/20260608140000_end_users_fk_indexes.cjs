exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nango_connections_end_user_id"
        ON "_nango_connections" ("end_user_id")
        WHERE "end_user_id" IS NOT NULL`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_connect_sessions_end_user_id"
        ON "connect_sessions" ("end_user_id")
        WHERE "end_user_id" IS NOT NULL`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_end_users_environment_id"
        ON "end_users" ("environment_id")`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
