import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS concurrency_metrics (
            bucket_start TIMESTAMPTZ NOT NULL,
            environment_id INTEGER NOT NULL CHECK (environment_id >= -1),
            active_concurrency INTEGER NOT NULL CHECK (active_concurrency >= 0),
            PRIMARY KEY (bucket_start, environment_id)
        ) PARTITION BY RANGE (bucket_start)
    `);
    await knex.raw(
        'CREATE INDEX IF NOT EXISTS idx_concurrency_metrics_environment_time ON concurrency_metrics (environment_id, bucket_start) INCLUDE (active_concurrency)'
    );
}

export async function down(): Promise<void> {}
