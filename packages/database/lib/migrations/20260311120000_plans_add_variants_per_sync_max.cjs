exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS variants_per_sync_max integer NOT NULL DEFAULT 100;
    `);
};

exports.down = async function () {};
