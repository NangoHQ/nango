const SHARED_CREDENTIALS_TABLE = 'providers_shared_credentials';

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE ${SHARED_CREDENTIALS_TABLE} DROP CONSTRAINT IF EXISTS providers_shared_credentials_name_key;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
