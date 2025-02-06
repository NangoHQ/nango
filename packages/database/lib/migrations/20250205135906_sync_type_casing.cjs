/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`UPDATE _nango_sync_configs SET sync_type = 'full' WHERE sync_type = 'FULL'`);
    await knex.raw(`UPDATE _nango_sync_configs SET sync_type = 'incremental' WHERE sync_type = 'INCREMENTAL'`);
};

exports.down = function () {
    // do nothing
};
