import knex from 'knex';

import { getLogger } from '@nangohq/utils';

import { UsageTelemetryClient } from './client.js';
import { envs } from './env.js';
import { migrate } from './postgres/migrate.js';
import { startPartitionDaemon } from './postgres/partitions.js';
import { NoopUsageStore } from './stores/noop.js';
import { PostgresUsageStore } from './stores/postgres.js';

import type { Knex } from 'knex';

const logger = getLogger('usage-telemetry');

let instance: Knex | undefined;
let client: UsageTelemetryClient | undefined;

/** The pool behind the store, or undefined when usage telemetry is off (no `NANGO_USAGE_TELEMETRY_POSTGRES_DATABASE_URL`). */
function usageTelemetryDb(): Knex | undefined {
    const url = envs.NANGO_USAGE_TELEMETRY_POSTGRES_DATABASE_URL;
    if (!url) {
        return undefined;
    }
    instance ??= knex({
        client: 'pg',
        connection: {
            connectionString: url,
            application_name: envs.NANGO_DB_APPLICATION_NAME,
            ssl: envs.NANGO_USAGE_TELEMETRY_POSTGRES_SSL ? { rejectUnauthorized: false } : false
        },
        pool: { min: 0, max: envs.NANGO_USAGE_TELEMETRY_POSTGRES_POOL_MAX }
    });
    return instance;
}

/** The one way services get at usage telemetry: backed by Postgres when configured, otherwise by a store that drops writes. */
export function getUsageTelemetryClient(): UsageTelemetryClient {
    if (!client) {
        const db = usageTelemetryDb();
        if (db) {
            client = new UsageTelemetryClient(new PostgresUsageStore(db));
        } else {
            logger.info('Usage telemetry: no database configured, points are dropped');
            client = new UsageTelemetryClient(new NoopUsageStore());
        }
    }
    return client;
}

export async function migrateUsageTelemetryDb(): Promise<void> {
    const db = usageTelemetryDb();
    if (db) {
        (await migrate({ knex: db })).unwrap();
    }
}

export function startUsageTelemetryPartitions(): { abort: () => Promise<void> } | null {
    const db = usageTelemetryDb();
    if (!db) {
        return null;
    }
    return startPartitionDaemon({
        knex: db,
        retentionDays: envs.NANGO_USAGE_TELEMETRY_POSTGRES_RETENTION_DAYS,
        tickIntervalMs: envs.NANGO_USAGE_TELEMETRY_POSTGRES_PARTITION_INTERVAL_MS
    });
}

export async function destroyUsageTelemetryDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
    client = undefined;
}
