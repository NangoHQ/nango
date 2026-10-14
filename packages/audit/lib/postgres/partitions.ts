import { dropExpiredPartitions as dropExpired, ensurePartitions as ensure, startPartitionDaemon as start } from '@nangohq/database';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const AUDIT_RETENTION_DAYS_DEFAULT = 365;

export function ensurePartitions({ knex, schema, dates }: { knex: Knex; schema: string; dates: Date[] }): Promise<Result<string[]>> {
    return ensure({ knex, schema, table: AUDIT_EVENTS_TABLE, dates });
}

export function dropExpiredPartitions({
    knex,
    schema,
    retentionDays,
    now
}: {
    knex: Knex;
    schema: string;
    retentionDays: number;
    now: Date;
}): Promise<Result<{ dropped: number; skipped: number }>> {
    return dropExpired({ knex, schema, table: AUDIT_EVENTS_TABLE, retentionDays, now });
}

export function startPartitionDaemon({
    knex,
    schema = AUDIT_SCHEMA,
    retentionDays = AUDIT_RETENTION_DAYS_DEFAULT,
    tickIntervalMs
}: {
    knex: Knex;
    schema?: string;
    retentionDays?: number;
    tickIntervalMs: number;
}): { abort: () => Promise<void> } {
    return start({ knex, schema, table: AUDIT_EVENTS_TABLE, retentionDays, tickIntervalMs });
}
