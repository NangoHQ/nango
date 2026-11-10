exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "audit_trail_data_plane_scopes" text[] NOT NULL DEFAULT '{}'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
