/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_growth_features boolean NOT NULL DEFAULT false`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS growth_features_ends_at timestamptz`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
