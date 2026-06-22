/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`UPDATE _nango_sync_jobs SET id_big = id WHERE id_big IS NULL`);
};

exports.down = function () {};
