exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('_nango_sync_data_records_deletes');
    await knex.schema.dropTableIfExists('_nango_sync_data_records');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    // there is no coming back from this
};
