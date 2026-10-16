import { dropExpiredDailyPartitions, ensureDailyPartitions, startDailyPartitionDaemon } from '@nangohq/migrations';

import { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export function ensurePartitions({ knex, schema, dates }: { knex: Knex; schema: string; dates: Date[] }): Promise<Result<string[]>> {
    return ensureDailyPartitions({ knex, schema, table: HOSTED_TELEMETRY_TABLE, dates });
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
    return dropExpiredDailyPartitions({ knex, schema, table: HOSTED_TELEMETRY_TABLE, retentionDays, now });
}

export function startPartitionDaemon({
    knex,
    schema = HOSTED_TELEMETRY_SCHEMA,
    retentionDays,
    tickIntervalMs
}: {
    knex: Knex;
    schema?: string;
    retentionDays: number;
    tickIntervalMs: number;
}): { abort: () => Promise<void> } {
    return startDailyPartitionDaemon({ knex, schema, table: HOSTED_TELEMETRY_TABLE, retentionDays, tickIntervalMs });
}
