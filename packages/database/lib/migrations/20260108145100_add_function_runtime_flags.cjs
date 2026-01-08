exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TYPE function_runtime AS ENUM (
            'runner',
            'lambda'
        );
    `);
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS sync_function_runtime function_runtime DEFAULT 'runner',
        ADD COLUMN IF NOT EXISTS action_function_runtime function_runtime DEFAULT 'runner',
        ADD COLUMN IF NOT EXISTS webhook_function_runtime function_runtime DEFAULT 'runner',
        ADD COLUMN IF NOT EXISTS on_event_function_runtime function_runtime DEFAULT 'runner'
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
