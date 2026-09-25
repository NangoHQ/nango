exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "function_configs_deleted_at_id_idx"
        ON "function_configs" ("deleted_at", "id")
        WHERE "deleted_at" IS NOT NULL`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
