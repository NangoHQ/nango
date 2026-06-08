/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ALTER COLUMN id DROP DEFAULT`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs DROP CONSTRAINT _nango_sync_jobs_pkey`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs RENAME COLUMN id TO id_old`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs RENAME COLUMN id_big TO id`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ALTER COLUMN id_old DROP NOT NULL`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ALTER COLUMN id SET NOT NULL`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs DROP CONSTRAINT IF EXISTS id_big_not_null`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ADD CONSTRAINT _nango_sync_jobs_pkey PRIMARY KEY USING INDEX sync_jobs_id_big_uidx`);
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ALTER COLUMN id SET DEFAULT nextval('nango._nango_sync_jobs_id_seq')`);
    await knex.raw(`ALTER SEQUENCE nango._nango_sync_jobs_id_seq OWNED BY nango._nango_sync_jobs.id`);
    await knex.raw(`DROP TRIGGER IF EXISTS _nango_sync_jobs_mirror_id_trigger ON nango._nango_sync_jobs`);
    await knex.raw(`DROP FUNCTION IF EXISTS nango._nango_sync_jobs_mirror_id()`);
};

exports.down = function () {};
