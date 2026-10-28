exports.config = { transaction: false };

const API_HASH_INDEX = 'idx_customer_keys_hashed_api';
const ORIGINAL_HASH_INDEX = 'idx_customer_keys_hashed_key_type';

/**
 * Restricts hash uniqueness to API keys. Webhook signing keys are only ever resolved by environment,
 * so customers can reuse the same signing key across environments (or after deleting one).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    const { rows } = await knex.raw(`SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(?)`, [API_HASH_INDEX]);
    // A failed concurrent build leaves an invalid index that IF NOT EXISTS would skip on retry.
    // Preserve valid indexes so retries never interrupt their uniqueness enforcement.
    if (rows[0]?.indisvalid === false) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [API_HASH_INDEX]);
    }

    await knex.raw(
        `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ??
        ON "customer_keys" ("hashed")
        WHERE "key_type" = 'api'`,
        [API_HASH_INDEX]
    );
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [ORIGINAL_HASH_INDEX]);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
