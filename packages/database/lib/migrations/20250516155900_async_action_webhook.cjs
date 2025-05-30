/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_external_webhooks" ADD COLUMN "on_async_action_completion" boolean DEFAULT true`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
