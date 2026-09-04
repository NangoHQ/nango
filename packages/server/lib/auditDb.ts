import knex from 'knex';

import { migratePostgres, startPartitionDaemon } from '@nangohq/audit';
import { flags } from '@nangohq/utils';

import { envs } from './env.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

/** Self-hosted and BYOC gate the trail on env vars rather than per account or plan. */
function isSelfHostedAuditTrailEnabled(url: string | undefined): url is string {
    return flags.hasAuditTrail && Boolean(url);
}

export function auditDb(): Knex | undefined {
    const url = envs.NANGO_AUDIT_POSTGRES_DATABASE_URL;
    if (!isSelfHostedAuditTrailEnabled(url)) {
        return undefined;
    }
    instance ??= knex({
        client: 'pg',
        connection: {
            connectionString: url,
            application_name: envs.NANGO_DB_APPLICATION_NAME,
            ssl: envs.NANGO_AUDIT_POSTGRES_SSL ? { rejectUnauthorized: false } : false
        },
        pool: { min: 0, max: envs.NANGO_AUDIT_POSTGRES_POOL_MAX }
    });
    return instance;
}

export async function migrateAuditDb(): Promise<void> {
    const db = auditDb();
    if (db) {
        (await migratePostgres({ knex: db })).unwrap();
    }
}

export function startAuditPartitions(): { abort: () => Promise<void> } | null {
    const db = auditDb();
    if (!db) {
        return null;
    }
    return startPartitionDaemon({
        knex: db,
        retentionDays: envs.NANGO_AUDIT_POSTGRES_RETENTION_DAYS,
        tickIntervalMs: envs.NANGO_AUDIT_POSTGRES_PARTITION_INTERVAL_MS
    });
}

export async function destroyAuditDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}
