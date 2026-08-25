import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // dropping existing indexes that are not being used by pg
    // replacing with a more specific index below used by the "mark previous generation as deleted" query
    await knex.raw(`DROP INDEX IF EXISTS records_sync_id_index;`);
    await knex.raw(`DROP INDEX IF EXISTS records_sync_job_id_index;`);

    // pg prevents adding index to parent table concurrently - must be done on each partition
    for (let p = 0; p < 256; p++) {
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS records_p${p}_mark_previous_generation_as_deleted
                   ON records_p${p}(connection_id, model, sync_id, sync_job_id)
                   WHERE deleted_at IS NULL;`
        );
    }
}

export async function down(): Promise<void> {}
