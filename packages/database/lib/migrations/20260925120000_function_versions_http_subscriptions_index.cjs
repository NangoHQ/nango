exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "function_versions_http_subscriptions_idx"
        ON "function_config_versions" ("id")
        WHERE "deleted_at" IS NULL
          AND "trigger"->>'kind' = 'http'
          AND CASE
              WHEN jsonb_typeof("trigger"->'subscriptions') = 'array'
              THEN jsonb_array_length("trigger"->'subscriptions')
              ELSE 0
          END > 0
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
