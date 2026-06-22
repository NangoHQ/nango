/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS sync_jobs_id_big_uidx ON _nango_sync_jobs (id_big)`);
};

exports.down = function () {};
