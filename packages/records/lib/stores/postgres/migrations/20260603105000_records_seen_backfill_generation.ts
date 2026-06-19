import type { Knex } from 'knex';

const TABLE = 'records_seen';

// Backfill any rows that still have NULL generation by copying from sync_job_id. This MUST run
// while sync_job_id is still the populated source-of-truth (i.e. before Phase 2f stops writing
// to it); otherwise a row with both columns NULL would silently stay NULL and be unrecoverable
// once sync_job_id is dropped. With dual-write live (Phase 2b) plus the operational ≥48h gate
// after Phase 2b rollout, cloud's UPDATE matches ~0 rows but the scan still confirms the
// guarantee (~48s on production volumes per local EXPLAIN ANALYZE, within the 73s liveness
// budget). On self-hosted the table is tiny so the same UPDATE completes in milliseconds.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`UPDATE "${TABLE}" SET generation = sync_job_id WHERE generation IS NULL`);
}

export async function down(): Promise<void> {}
