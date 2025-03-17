/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DROP TABLE "_nango_sync_schedules"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    // There is no coming back
};
