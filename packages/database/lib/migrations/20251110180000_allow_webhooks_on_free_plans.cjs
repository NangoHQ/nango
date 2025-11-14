exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans').where('name', 'free').update({
        has_webhooks_script: true,
        has_webhooks_forward: true
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
