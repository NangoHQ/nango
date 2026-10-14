import { dropExpiredPartitions as dropExpired, ensurePartitions as ensure, startPartitionDaemon as start } from '@nangohq/database';

import { USAGE_TELEMETRY_SCHEMA, USAGE_TELEMETRY_TABLE } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export function ensurePartitions({ knex, schema, dates }: { knex: Knex; schema: string; dates: Date[] }): Promise<Result<string[]>> {
    return ensure({ knex, schema, table: USAGE_TELEMETRY_TABLE, dates });
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
    return dropExpired({ knex, schema, table: USAGE_TELEMETRY_TABLE, retentionDays, now });
}

export function startPartitionDaemon({
    knex,
    schema = USAGE_TELEMETRY_SCHEMA,
    retentionDays,
    tickIntervalMs
}: {
    knex: Knex;
    schema?: string;
    retentionDays: number;
    tickIntervalMs: number;
}): { abort: () => Promise<void> } {
    return start({ knex, schema, table: USAGE_TELEMETRY_TABLE, retentionDays, tickIntervalMs });
}
