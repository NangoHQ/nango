exports.config = { transaction: false };

const { stripLegacyApiKeyScopes } = require('../migration-helpers/stripLegacyApiKeyScopes.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await stripLegacyApiKeyScopes(knex);
};

exports.down = function () {};
