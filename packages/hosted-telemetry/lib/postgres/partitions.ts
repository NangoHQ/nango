import { startDailyPartitionDaemon } from '@nangohq/migrations';

import { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { Knex } from 'knex';

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
