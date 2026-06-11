/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS records_store VARCHAR(255) NOT NULL DEFAULT 'default'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

exports.config = { transaction: true };
