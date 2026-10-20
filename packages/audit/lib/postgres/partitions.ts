import { startDailyPartitionDaemon } from '@nangohq/migrations';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from './schema.js';

import type { Knex } from 'knex';

const AUDIT_RETENTION_DAYS_DEFAULT = 365;

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
    return startDailyPartitionDaemon({ knex, schema, table: AUDIT_EVENTS_TABLE, retentionDays, tickIntervalMs });
}
