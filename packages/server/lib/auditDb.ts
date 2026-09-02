import knex from 'knex';

import { envs } from './env.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

/** Self-hosted and BYOC gate the trail on env vars rather than per account or plan. */
export function isSelfHostedAuditTrailEnabled(url: string | undefined): url is string {
    return envs.FLAG_AUDIT_TRAIL_ENABLED && Boolean(url);
}

export function auditDb(url: string): Knex {
    instance ??= knex({
        client: 'pg',
        connection: {
            connectionString: url,
            application_name: envs.NANGO_DB_APPLICATION_NAME,
            ssl: envs.NANGO_DB_SSL ? { rejectUnauthorized: false } : false
        },
        pool: { min: 0, max: envs.AUDIT_DB_POOL_MAX }
    });
    return instance;
}

export async function destroyAuditDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}
