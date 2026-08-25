import type { Knex } from 'knex';

const TABLE = 'records_seen';

// Drops the NOT NULL constraint on sync_job_id so Phase 2f can stop writing to it without
// in-flight writers violating the constraint during their rolling deploy. Metadata-only — no
// scan, no table rewrite.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE "${TABLE}" ALTER COLUMN sync_job_id DROP NOT NULL`);
}

export async function down(): Promise<void> {}
