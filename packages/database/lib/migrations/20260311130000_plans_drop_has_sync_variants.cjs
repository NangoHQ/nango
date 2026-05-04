exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        DROP COLUMN IF EXISTS has_sync_variants;
    `);
};

exports.down = async function () {};
