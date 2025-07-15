exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_connections" ADD COLUMN IF NOT EXISTS "last_execution_at" timestamptz;`);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nango_connections_last_execution_at" ON "_nango_connections" ("last_execution_at") WHERE "last_execution_at" IS NOT NULL;`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {};
