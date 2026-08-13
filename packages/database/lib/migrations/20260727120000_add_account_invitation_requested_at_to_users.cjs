/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_users" ADD COLUMN IF NOT EXISTS "account_invitation_requested_at" timestamptz NULL`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
