import type { Knex } from 'knex';

const TABLE = 'records_seen';

// Step 3 of the online int4 -> bigint widening of records_seen.sync_job_id: swap the new column
// in and drop the old one. Must NOT run until ≥48h after Phase 2a deployed, so the daily
// partition turnover has filled sync_job_id_new for every row written before the trigger went
// live. Single transaction of metadata-only DDL — short ACCESS EXCLUSIVE window.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '3s'`);
    await knex.raw(`DROP TRIGGER IF EXISTS records_seen_mirror_sync_job_id_trigger ON "${TABLE}"`);
    await knex.raw(`DROP FUNCTION IF EXISTS records_seen_mirror_sync_job_id()`);
    // Dropping the old column cascades the old parent partitioned index + its child indexes.
    await knex.raw(`ALTER TABLE "${TABLE}" DROP COLUMN sync_job_id`);
    await knex.raw(`ALTER TABLE "${TABLE}" RENAME COLUMN sync_job_id_new TO sync_job_id`);
    await knex.raw(`ALTER INDEX records_seen_connection_model_job_new RENAME TO records_seen_connection_model_job`);
}

export async function down(): Promise<void> {}
