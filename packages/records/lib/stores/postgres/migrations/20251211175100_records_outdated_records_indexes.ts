import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // adding a more specific index used by the "mark previous generation as deleted" query
    // removing sync_id from the index as it's not used in the query filter anymore
    // pg prevents adding index to parent table concurrently - must be done on each partition
    for (let p = 0; p < 256; p++) {
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS records_p${p}_mark_previous_generation_as_deleted_v2
                ON nango_records.records_p${p}(connection_id, model, sync_job_id)
                INCLUDE (id)
                WHERE deleted_at IS NULL;`
        );
    }

    // droping existing indexes that are not being used by pg
    for (let p = 0; p < 256; p++) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS records_p${p}_mark_previous_generation_as_deleted;`);
    }
}

export async function down(): Promise<void> {}
