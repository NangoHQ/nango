/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_sync_configs" ADD COLUMN IF NOT EXISTS "features" text[] NOT NULL DEFAULT ARRAY[]::text[]`);
};

exports.down = function () {};
