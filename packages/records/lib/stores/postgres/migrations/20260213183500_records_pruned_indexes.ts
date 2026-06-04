import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // adding a more specific index used to delete pruned records in batches
    // pg prevents adding index to parent table concurrently - must be done on each partition
    for (let p = 0; p < 256; p++) {
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS records_p${p}_connection_model_updatedat_id_not_pruned
                ON records_p${p}(connection_id, model, updated_at, id)
                WHERE pruned_at IS NULL;`
        );
    }
}

export async function down(): Promise<void> {}
