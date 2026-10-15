import knex from 'knex';

import db from '@nangohq/database';
import { migrate, startPartitionDaemon } from '@nangohq/hosted-telemetry';
import { flags } from '@nangohq/utils';

import { envs } from './env.js';

import type { Knex } from 'knex';

let dedicated: Knex | undefined;

/** Self-hosted and BYOC turn hosted telemetry on with a flag. It lives in the main database unless a URL moves it. */
export function hostedTelemetryDb(): Knex | undefined {
    if (!flags.hasHostedTelemetry) {
        return undefined;
    }
    const url = envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL;
    if (!url) {
        return db.knex;
    }
    dedicated ??= knex({
        client: 'pg',
        connection: {
            connectionString: url,
            application_name: envs.NANGO_DB_APPLICATION_NAME,
            ssl: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_SSL ? { rejectUnauthorized: false } : false
        },
        pool: { min: 0, max: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_POOL_MAX }
    });
    return dedicated;
}

export async function migrateHostedTelemetryDb(): Promise<void> {
    const target = hostedTelemetryDb();
    if (target) {
        (await migrate({ knex: target })).unwrap();
    }
}

export function startHostedTelemetryPartitions(): { abort: () => Promise<void> } | null {
    const target = hostedTelemetryDb();
    if (!target) {
        return null;
    }
    return startPartitionDaemon({
        knex: target,
        retentionDays: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_RETENTION_DAYS,
        tickIntervalMs: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_PARTITION_INTERVAL_MS
    });
}

export async function destroyHostedTelemetryDb(): Promise<void> {
    await dedicated?.destroy();
    dedicated = undefined;
}
