/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_configs" ADD COLUMN "forward_webhooks" boolean DEFAULT true`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
