import { ENVS, Err, Ok, parseEnvs, stringifyError } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import { clickhouseClient, database as usageDatabase } from './config.js';
import { logger } from '../logger.js';

import type { UsageEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const envs = parseEnvs(ENVS);

export interface ClickhouseUsageEvent {
    ts: number; // Unix timestamp in milliseconds, matches DateTime64(3)
    idempotency_key: UsageEvent['idempotencyKey'];
    type: UsageEvent['type'];
    value: UsageEvent['payload']['value'];
    account_id: UsageEvent['payload']['properties']['accountId'];
    attributes: Omit<UsageEvent['payload']['properties'], 'accountId'>;
}

export class ClickhouseIngestion {
    private batcher: Batcher<ClickhouseUsageEvent> | null = null;
    private client: ReturnType<typeof clickhouseClient> = null;

    constructor(opts: { database: string } = { database: usageDatabase }) {
        const client = clickhouseClient(opts);
        if (!client) {
            return;
        }

        this.client = client;
        this.batcher = new Batcher({
            process: async (events) => {
                try {
                    await client.insert({
                        table: 'raw_events',
                        values: events,
                        format: 'JSONEachRow'
                    });
                } catch (err) {
                    logger.error(`Failed to insert usage events into Clickhouse: ${stringifyError(err)}`);
                    throw err;
                }
            },
            maxBatchSize: envs.CLICKHOUSE_USAGE_INGEST_BATCH_SIZE,
            flushIntervalMs: envs.CLICKHOUSE_USAGE_INGEST_BATCH_INTERVAL_MS,
            maxQueueSize: envs.CLICKHOUSE_USAGE_INGEST_MAX_QUEUE_SIZE
        });
    }

    add(events: UsageEvent[]): Result<void> {
        if (!this.batcher) {
            return Ok(undefined);
        }
        const rows = events.flatMap((event) => {
            const row = toRow(event);
            return row && row.value > 0 ? [row] : [];
        });
        return this.batcher.add(...rows);
    }

    async shutdown(): Promise<Result<void>> {
        const res = this.batcher ? await this.batcher.shutdown() : Ok(undefined);

        try {
            await this.client?.close();
        } catch (err) {
            return Err(new Error('Failed to close Clickhouse client', { cause: err }));
        }

        return res;
    }
}

function toRow(event: UsageEvent): ClickhouseUsageEvent | null {
    switch (event.type) {
        case 'usage.monthly_active_records':
        case 'usage.actions':
        case 'usage.function_executions':
        case 'usage.proxy':
        case 'usage.webhook_forward': {
            const { accountId, ...properties } = event.payload.properties;
            return {
                ts: event.createdAt.getTime(),
                idempotency_key: event.idempotencyKey,
                type: event.type,
                account_id: accountId,
                value: event.payload.value,
                attributes: properties
            };
        }
        case 'usage.records':
        case 'usage.connections':
            // Not ingested into Clickhouse via events
            return null;
    }
}
