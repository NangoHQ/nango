/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        ALTER TABLE plans
            ADD COLUMN IF NOT EXISTS sync_max_concurrency_override INTEGER NULL CHECK (sync_max_concurrency_override >= 0),
            ADD COLUMN IF NOT EXISTS action_max_concurrency_override INTEGER NULL CHECK (action_max_concurrency_override >= 0),
            ADD COLUMN IF NOT EXISTS webhook_max_concurrency_override INTEGER NULL CHECK (webhook_max_concurrency_override >= 0),
            ADD COLUMN IF NOT EXISTS on_event_max_concurrency_override INTEGER NULL CHECK (on_event_max_concurrency_override >= 0)
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

exports.config = { transaction: true };
