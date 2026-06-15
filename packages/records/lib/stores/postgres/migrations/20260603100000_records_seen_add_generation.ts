import type { Knex } from 'knex';

const TABLE = 'records_seen';

// First step of the expand-contract widening that replaces records_seen.sync_job_id (int4) with a
// bigint column called generation. Adding the column is metadata-only and nullable so writers can
// adopt it (Phase 2b) without a schema dance.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS generation bigint`);
}

export async function down(): Promise<void> {}
