exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs DROP COLUMN IF EXISTS pre_built`);
    await knex.raw(`ALTER TABLE _nango_sync_configs DROP COLUMN IF EXISTS is_public`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
