import type { Knex } from 'knex';

const TABLE = 'records_seen';

// Step 3 of the online int4 -> bigint widening of records_seen.sync_job_id: swap the new column
// in and drop the old one. Must NOT run until ≥48h after BOTH Phase 2a (column + mirror trigger)
// AND Phase 2b (ensureSeenPartition creating the child index on new partitions) have been
// deployed, so the daily-partition turnover has filled sync_job_id_new for every live row AND
// every live partition has the (connection_id, model, sync_job_id_new) index.
// Single transaction of metadata-only DDL — short ACCESS EXCLUSIVE window.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '3s'`);
    await knex.raw(`DROP TRIGGER IF EXISTS records_seen_mirror_sync_job_id_trigger ON "${TABLE}"`);
    await knex.raw(`DROP FUNCTION IF EXISTS records_seen_mirror_sync_job_id()`);
    // Dropping the old column cascades the old parent partitioned index + its auto-attached
    // child indexes. The orphan per-partition indexes on sync_job_id_new (created by
    // ensureSeenPartition in Phase 2b) survive — their column reference follows the rename.
    await knex.raw(`ALTER TABLE "${TABLE}" DROP COLUMN sync_job_id`);
    await knex.raw(`ALTER TABLE "${TABLE}" RENAME COLUMN sync_job_id_new TO sync_job_id`);
}

export async function down(): Promise<void> {}
