exports.config = { transaction: false };

/**
 * Functions (createFunction/createWebhook) deploy as _nango_sync_configs rows with type 'function'.
 * Unlike syncs/actions they carry triggers (with ingress/debounce config) rather than a single `runs`
 * schedule, so we persist that function-specific shape in a dedicated jsonb column. Null for sync/action/on-event.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs ADD COLUMN IF NOT EXISTS function_config JSONB`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs DROP COLUMN IF EXISTS function_config`);
};
