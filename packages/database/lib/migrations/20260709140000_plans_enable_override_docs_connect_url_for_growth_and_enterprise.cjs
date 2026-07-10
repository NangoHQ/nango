exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans')
        .whereIn('name', ['growth', 'growth-v2', 'enterprise', 'enterprise-cloud-hosted', 'free-uncapped', 'startup-deal'])
        .update({ can_override_docs_connect_url: true });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
