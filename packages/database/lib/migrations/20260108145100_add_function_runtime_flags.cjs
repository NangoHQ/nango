exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TYPE function_runtime AS ENUM (
            'runner',
            'lambda'
        );
    `);
    await knex.schema.raw(`
        ALTER TABLE "plans" ADD COLUMN "sync_function_runtime" function_runtime DEFAULT 'nango-runner';
        ALTER TABLE "plans" ADD COLUMN "action_function_runtime" function_runtime DEFAULT 'nango-runner';
        ALTER TABLE "plans" ADD COLUMN "webhook_function_runtime" function_runtime DEFAULT 'nango-runner';
        ALTER TABLE "plans" ADD COLUMN "on_event_function_runtime" function_runtime DEFAULT 'nango-runner';
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
