exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans"
ADD COLUMN "has_webhooks_script" bool DEFAULT 'false',
ADD COLUMN "has_webhooks_forward" bool DEFAULT 'false'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
