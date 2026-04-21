exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "has_rbac" bool NOT NULL DEFAULT 'false'`);
    // Backfill growth+ plans, while grandfathering accounts that already use RBAC.
    await knex.raw(`
        UPDATE "plans" AS p
        SET "has_rbac" = true
        WHERE p."name" IN ('growth', 'growth-v2', 'enterprise')
            OR EXISTS (
                SELECT 1
                FROM "_nango_users" AS u
                WHERE u."account_id" = p."account_id"
                    AND u."role" <> 'administrator'
            )
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
