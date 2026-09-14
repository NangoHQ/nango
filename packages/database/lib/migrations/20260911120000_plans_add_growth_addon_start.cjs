/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS growth_features_starts_at timestamptz`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
