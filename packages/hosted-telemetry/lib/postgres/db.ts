import { setTimeout } from 'node:timers/promises';

import knex from 'knex';

import { getDbConfig } from '@nangohq/database';
import { flags, getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { migrate } from './migrate.js';
import { startPartitionDaemon } from './partitions.js';

import type { Knex } from 'knex';

const logger = getLogger('hosted-telemetry');

const DEFAULT_DESTROY_TIMEOUT_MS = 5_000;
const TIMED_OUT = Symbol('timed out');

let instance: Knex | undefined;

/**
 * Self-hosted and BYOC turn hosted telemetry on with a flag. It gets a pool of its own, to the main database
 * unless a URL moves it, so a flush never waits on request traffic and never holds a connection it needs.
 */
export function hostedTelemetryDb(): Knex | undefined {
    if (!flags.hasHostedTelemetry) {
        return undefined;
    }
    const url = envs.NANGO_HOSTED_TELEMETRY_POSTGRES_DATABASE_URL;
    const base = getDbConfig({ timeoutMs: 60_000 });
    instance ??= knex({
        ...base,
        ...(url && {
            connection: {
                ...(base.connection as Knex.PgConnectionConfig),
                connectionString: url,
                ssl: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_SSL ? { rejectUnauthorized: false } : false
            }
        }),
        pool: { ...base.pool, min: 0, max: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_POOL_MAX }
    });
    return instance;
}

export async function migrateHostedTelemetryDb(): Promise<void> {
    const db = hostedTelemetryDb();
    if (db) {
        (await migrate({ knex: db })).unwrap();
    }
}

export function startHostedTelemetryPartitions(): { abort: () => Promise<void> } | null {
    const db = hostedTelemetryDb();
    if (!db) {
        return null;
    }
    return startPartitionDaemon({
        knex: db,
        retentionDays: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_RETENTION_DAYS,
        tickIntervalMs: envs.NANGO_HOSTED_TELEMETRY_POSTGRES_PARTITION_INTERVAL_MS
    });
}

/**
 * Knex waits for every connection in use to be released before it closes the pool, so an export still running after
 * a timed-out shutdown would hold this up. It stops waiting after `timeoutMs` (5s by default), and the connections left
 * close when the process exits.
 */
export async function destroyHostedTelemetryDb({ timeoutMs = DEFAULT_DESTROY_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<void> {
    const db = instance;
    instance = undefined;
    if (!db) {
        return;
    }

    const winner = await Promise.race([db.destroy(), setTimeout(timeoutMs, TIMED_OUT, { ref: false })]);
    if (winner === TIMED_OUT) {
        logger.warning(`Pool destroy stopped waiting after ${timeoutMs}ms, a query was still holding a connection`);
    }
}
