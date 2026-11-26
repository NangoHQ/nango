exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_connect_sessions_environment_id"`);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_connect_sessions_environment_id"
        ON "connect_sessions" ("environment_id")`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
