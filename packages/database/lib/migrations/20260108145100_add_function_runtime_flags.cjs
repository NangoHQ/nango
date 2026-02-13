exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DO $$
        BEGIN
            CREATE TYPE function_runtime AS ENUM (
                'runner',
                'lambda'
        );
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END
        $$`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS sync_function_runtime function_runtime DEFAULT 'runner'`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS action_function_runtime function_runtime DEFAULT 'runner'`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS webhook_function_runtime function_runtime DEFAULT 'runner'`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS on_event_function_runtime function_runtime DEFAULT 'runner'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
