/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ADD CONSTRAINT id_big_not_null CHECK (id_big IS NOT NULL) NOT VALID`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs VALIDATE CONSTRAINT id_big_not_null`);
};

exports.down = function () {};
