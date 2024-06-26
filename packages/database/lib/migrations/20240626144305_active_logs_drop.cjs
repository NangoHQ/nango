exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('_nango_activity_log_messages');
    await knex.schema.dropTableIfExists('_nango_activity_logs');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    // there is no coming back from this
};
