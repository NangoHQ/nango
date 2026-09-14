/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_external_webhooks" ADD COLUMN IF NOT EXISTS "on_connection_deletion" boolean DEFAULT false`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
