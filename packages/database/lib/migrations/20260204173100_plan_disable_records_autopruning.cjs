exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS has_records_autopruning boolean NOT NULL DEFAULT true;
    `);
};

exports.down = async function () {};
