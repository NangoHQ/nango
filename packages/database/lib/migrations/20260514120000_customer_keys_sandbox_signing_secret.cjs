exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE customer_keys
            ADD COLUMN IF NOT EXISTS sandbox_signing_secret VARCHAR(255),
            ADD COLUMN IF NOT EXISTS sandbox_signing_secret_iv VARCHAR(255) NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS sandbox_signing_secret_tag VARCHAR(255) NOT NULL DEFAULT '';
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        ALTER TABLE customer_keys
            DROP COLUMN IF EXISTS sandbox_signing_secret,
            DROP COLUMN IF EXISTS sandbox_signing_secret_iv,
            DROP COLUMN IF EXISTS sandbox_signing_secret_tag;
    `);
};
