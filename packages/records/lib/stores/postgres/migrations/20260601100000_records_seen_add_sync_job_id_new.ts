import type { Knex } from 'knex';

const TABLE = 'records_seen';

// records_seen.sync_job_id is being widened int4 -> bigint online, in steps.
// Step 1: add a nullable bigint shadow column and mirror every write into it via a trigger,
// so the new column is populated going forward. Later migrations build its index and swap it in
// once the column is fully populated (records_seen fully turns over within its retention window).
// PG 16 row triggers on a partitioned parent automatically apply to existing partitions AND to
// new ones created later, so daily partitions from ensureSeenPartition inherit it.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS sync_job_id_new bigint`);
    await knex.raw(`
        CREATE OR REPLACE FUNCTION ${TABLE}_mirror_sync_job_id()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.sync_job_id_new := NEW.sync_job_id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);
    await knex.raw(`
        CREATE TRIGGER ${TABLE}_mirror_sync_job_id_trigger
        BEFORE INSERT OR UPDATE ON "${TABLE}"
        FOR EACH ROW
        EXECUTE FUNCTION ${TABLE}_mirror_sync_job_id();
    `);
}

export async function down(): Promise<void> {}
