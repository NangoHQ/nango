exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "function_instances_active_config_id_idx"
        ON "function_instances" ("function_config_id", "id")
        WHERE "deleted_at" IS NULL`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
