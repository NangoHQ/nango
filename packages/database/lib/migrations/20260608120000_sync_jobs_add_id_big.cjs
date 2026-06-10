/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE nango._nango_sync_jobs ADD COLUMN IF NOT EXISTS id_big bigint`);
    await knex.raw(`
        CREATE OR REPLACE FUNCTION nango._nango_sync_jobs_mirror_id()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.id_big := NEW.id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);
    await knex.raw(`
        CREATE TRIGGER _nango_sync_jobs_mirror_id_trigger
        BEFORE INSERT OR UPDATE ON nango._nango_sync_jobs
        FOR EACH ROW
        EXECUTE FUNCTION nango._nango_sync_jobs_mirror_id();
    `);
};

exports.down = function () {};
