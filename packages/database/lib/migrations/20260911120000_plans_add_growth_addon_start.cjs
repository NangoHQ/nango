exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS growth_features_starts_at timestamptz`);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_plans_growth_addon_starts_at" ON "plans" ("name", "growth_features_starts_at") WHERE "growth_features_starts_at" IS NOT NULL;`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_plans_growth_addon_ends_at" ON "plans" ("name", "growth_features_ends_at") WHERE "growth_features_ends_at" IS NOT NULL;`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
