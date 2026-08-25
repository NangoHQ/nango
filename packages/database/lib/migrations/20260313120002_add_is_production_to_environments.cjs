exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_environments
        ADD COLUMN IF NOT EXISTS is_production BOOLEAN NOT NULL DEFAULT false
    `);
};

exports.down = function () {};
