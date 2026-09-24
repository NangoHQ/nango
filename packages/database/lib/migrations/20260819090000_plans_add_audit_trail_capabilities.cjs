exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE "plans"
            ADD COLUMN IF NOT EXISTS "has_audit_trail_control_plane" bool NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "has_audit_trail_access" bool NOT NULL DEFAULT false
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
