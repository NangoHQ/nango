exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        DROP COLUMN IF EXISTS external_webhooks_max
    `);
};

exports.down = async function () {};
