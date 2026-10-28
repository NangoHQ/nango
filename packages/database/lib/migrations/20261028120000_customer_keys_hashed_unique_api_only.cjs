exports.config = { transaction: false };

/**
 * Restricts hash uniqueness to API keys. Webhook signing keys are only ever resolved by environment,
 * so customers can reuse the same signing key across environments (or after deleting one).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_customer_keys_hashed_api"
        ON "customer_keys" ("hashed")
        WHERE "key_type" = 'api'`
    );
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_customer_keys_hashed_key_type"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
