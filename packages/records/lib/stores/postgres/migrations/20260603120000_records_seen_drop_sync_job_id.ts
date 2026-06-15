import type { Knex } from 'knex';

const TABLE = 'records_seen';

// Final step of the expand-contract widening. Phase 2c backfilled every NULL generation row
// while sync_job_id was still the populated source-of-truth; Phase 2d switched reads onto
// generation; Phase 2f stopped writing sync_job_id. DROP COLUMN here cascades the original
// records_seen_connection_model_job parent partitioned index and every auto-attached child —
// the per-partition (connection_id, model, generation) indexes that ensureSeenPartition has
// been creating since Phase 2b survive intact.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE "${TABLE}" DROP COLUMN sync_job_id`);
}

export async function down(): Promise<void> {}
