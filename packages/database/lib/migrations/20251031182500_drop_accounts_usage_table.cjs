exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('accounts_usage');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
