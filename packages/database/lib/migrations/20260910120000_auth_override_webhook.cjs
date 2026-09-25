/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_external_webhooks" ADD COLUMN IF NOT EXISTS "on_auth_override" boolean DEFAULT true`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
