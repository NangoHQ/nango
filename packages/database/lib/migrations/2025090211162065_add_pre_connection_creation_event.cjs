exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
    ALTER TYPE script_trigger_event
    ADD VALUE IF NOT EXISTS 'PRE_CONNECTION_CREATION';
  `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
