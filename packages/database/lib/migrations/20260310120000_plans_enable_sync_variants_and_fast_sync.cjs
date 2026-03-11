/**
 * Align plan rows with updated default values for free and starter plans.
 * - sync_frequency_secs_min: set to 30 only when currently > 30 (e.g. 3600);
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans').whereIn('name', ['free', 'starter']).where('sync_frequency_secs_min', '>', 30).update({ sync_frequency_secs_min: 30 });
};

/**
 * Revert only rows that have the new defaults back to old defaults. Could restrict previously overwritten values.
 *
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex('plans').whereIn('name', ['free', 'starter']).where({ sync_frequency_secs_min: 30 }).update({
        sync_frequency_secs_min: 3600
    });
};
