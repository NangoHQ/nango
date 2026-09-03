import knex from 'knex';

import { flags } from '@nangohq/utils';

import { envs } from './env.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

/** Self-hosted and BYOC gate the trail on env vars rather than per account or plan. */
export function isSelfHostedAuditTrailEnabled(url: string | undefined): url is string {
    return flags.hasAuditTrail && Boolean(url);
}

export function auditDb(url: string): Knex {
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

export async function destroyAuditDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}
