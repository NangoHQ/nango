import type { Knex } from 'knex';

const TABLE = 'records_seen';
const PARENT_INDEX = 'records_seen_connection_model_job_new';

export const config = { transaction: false };

// Step 2 of records_seen.sync_job_id widening: build the parent partitioned index on the shadow
// column online, via the documented CONCURRENTLY + ATTACH path. For each live partition,
// CREATE INDEX CONCURRENTLY (no write blocking); then CREATE INDEX ON ONLY the parent (invalid
// until all children attached); then ALTER INDEX ... ATTACH PARTITION for each child. After the
// last ATTACH, the parent's indisvalid flips to true. Future daily partitions auto-inherit a
// child index from this parent template. The swap (Phase 2c) renames it to canonical.
export async function up(knex: Knex): Promise<void> {
    const r: { rows: { relname: string }[] } = await knex.raw(
        `SELECT c.relname FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = ?::regclass
         ORDER BY c.relname`,
        [TABLE]
    );
    const partitions = r.rows.map((row) => row.relname);

    for (const p of partitions) {
        await knex.raw('CREATE INDEX CONCURRENTLY ?? ON ?? (connection_id, model, sync_job_id_new)', [`${p}_connection_model_job_new`, p]);
    }
    await knex.raw('CREATE INDEX ?? ON ONLY ?? (connection_id, model, sync_job_id_new)', [PARENT_INDEX, TABLE]);
    for (const p of partitions) {
        await knex.raw('ALTER INDEX ?? ATTACH PARTITION ??', [PARENT_INDEX, `${p}_connection_model_job_new`]);
    }
}

export async function down(): Promise<void> {}
