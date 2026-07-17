exports.config = { transaction: false };

const { INDEX_NAME, createNangoUsersLowerEmailIndex } = require('../migration-helpers/nangoUsersLowerEmailIndex.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await createNangoUsersLowerEmailIndex(knex);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
};
