exports.config = { transaction: false };

const { renameDryrunApiKeyScope } = require('../migration-helpers/renameDryrunApiKeyScope.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await renameDryrunApiKeyScope(knex);
};

exports.down = function () {};
