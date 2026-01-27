exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Note: Postgres does not support RENAME COLUMN with IF EXISTS.
    await knex.raw(`
        ALTER TABLE _nango_environments RENAME COLUMN secret_key             TO deprecated_secret_key;
        ALTER TABLE _nango_environments RENAME COLUMN secret_key_iv          TO deprecated_secret_key_iv;
        ALTER TABLE _nango_environments RENAME COLUMN secret_key_tag         TO deprecated_secret_key_tag;
        ALTER TABLE _nango_environments RENAME COLUMN secret_key_hashed      TO deprecated_secret_key_hashed;
        ALTER TABLE _nango_environments RENAME COLUMN pending_secret_key     TO deprecated_pending_secret_key;
        ALTER TABLE _nango_environments RENAME COLUMN pending_secret_key_iv  TO deprecated_pending_secret_key_iv;
        ALTER TABLE _nango_environments RENAME COLUMN pending_secret_key_tag TO deprecated_pending_secret_key_tag;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_secret_key             TO secret_key;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_secret_key_iv          TO secret_key_iv;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_secret_key_tag         TO secret_key_tag;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_secret_key_hashed      TO secret_key_hashed;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_pending_secret_key     TO pending_secret_key;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_pending_secret_key_iv  TO pending_secret_key_iv;
        ALTER TABLE _nango_environments RENAME COLUMN deprecated_pending_secret_key_tag TO pending_secret_key_tag;
    `);
};
