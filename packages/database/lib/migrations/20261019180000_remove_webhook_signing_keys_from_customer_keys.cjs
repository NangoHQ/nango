exports.config = { transaction: false };

const {
    copyNewerWebhookSigningKeys,
    deleteWebhookSigningCustomerKeys,
    narrowCustomerKeyTypeToApi
} = require('../migration-helpers/removeWebhookSigningKeys.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await copyNewerWebhookSigningKeys(knex);
    await deleteWebhookSigningCustomerKeys(knex);
    await narrowCustomerKeyTypeToApi(knex);
};

exports.down = async function () {};
