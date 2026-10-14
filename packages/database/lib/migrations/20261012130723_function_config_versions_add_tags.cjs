exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `ALTER TABLE "function_config_versions"
        ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '{}'`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "function_config_versions_tags_gin_idx"
        ON "function_config_versions"
        USING GIN ("tags" jsonb_ops)`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
