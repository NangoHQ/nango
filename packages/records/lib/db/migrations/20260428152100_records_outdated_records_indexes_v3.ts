import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // removing `id` from the index as it's not used in the delete outdated records query anymore
    // in order to significantly reduce the size of the index
    // pg prevents adding index to parent table concurrently - must be done on each partition
    for (let p = 0; p < 256; p++) {
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS records_p${p}_mark_previous_generation_as_deleted_v3
                ON nango_records.records_p${p}(connection_id, model, sync_job_id)
                WHERE deleted_at IS NULL;`
        );
    }

    // dropping previous indexes
    for (let p = 0; p < 256; p++) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS records_p${p}_mark_previous_generation_as_deleted_v2;`);
    }
}

export async function down(): Promise<void> {}
