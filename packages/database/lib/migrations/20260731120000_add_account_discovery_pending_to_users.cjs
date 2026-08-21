exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_users" ADD COLUMN IF NOT EXISTS "account_discovery_pending" BOOLEAN NOT NULL DEFAULT FALSE`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
