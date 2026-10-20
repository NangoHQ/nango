/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_configs" ADD COLUMN IF NOT EXISTS "allow_unverified_webhooks" boolean NOT NULL DEFAULT false`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
