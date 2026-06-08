/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs DROP COLUMN IF EXISTS id_old`);
    await knex.raw(`ALTER SEQUENCE nango._nango_sync_jobs_id_seq AS bigint MAXVALUE 9223372036854775807`);
};

exports.down = function () {};
