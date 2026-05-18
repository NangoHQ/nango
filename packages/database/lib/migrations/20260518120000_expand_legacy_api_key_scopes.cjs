exports.config = { transaction: false };

const { expandLegacyApiKeyScopes } = require('../migration-helpers/expandLegacyApiKeyScopes.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await expandLegacyApiKeyScopes(knex);
};

exports.down = function () {};
