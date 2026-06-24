import { makeDataTransferEvent, pubsub } from '@nangohq/shared';
import { Batcher, ENVS, getLogger, parseEnvs } from '@nangohq/utils';

import type { DataTransferCallsite } from '@nangohq/types';
import type { Grouping, Result } from '@nangohq/utils';

const envs = parseEnvs(ENVS);
const logger = getLogger('server.egress.telemetry');

export interface ServerEgressTelemetry {
    package: 'server';
    callsite: Extract<DataTransferCallsite, 'get_/records'>;
    accountId: number;
    connectionId: string;
    integrationId: string;
    environmentId: number;
    environmentName: string;
    egressedBytes: number;
    count: number;
}

const grouping: Grouping<ServerEgressTelemetry> = {
    groupingKey: (t) => `${t.callsite}:${t.accountId}:${t.environmentId}:${t.integrationId}:${t.connectionId}`,
    aggregate: (acc, t) => ({
        ...acc,
        egressedBytes: Math.min(acc.egressedBytes + t.egressedBytes, Number.MAX_SAFE_INTEGER),
        count: acc.count + t.count
    })
};

const batcher = new Batcher<ServerEgressTelemetry>({
    maxBatchSize: envs.SERVER_EGRESS_TELEMETRY_BATCH_SIZE,
    flushIntervalMs: envs.SERVER_EGRESS_TELEMETRY_FLUSH_INTERVAL_MS,
    maxQueueSize: envs.SERVER_EGRESS_TELEMETRY_MAX_QUEUE_SIZE,
    grouping,
    logger,
    process: async (events) => {
        const res = await pubsub.publisher.publishBatch({
            subject: 'usage',
            events: events.map((t) =>
                makeDataTransferEvent({
                    pkg: t.package,
                    callsite: t.callsite,
                    accountId: t.accountId,
                    connectionId: t.connectionId,
                    integrationId: t.integrationId,
                    environmentId: t.environmentId,
                    environmentName: t.environmentName,
                    meteredBytes: { sent: t.egressedBytes, received: 0 },
                    count: t.count
                })
            )
        });
        if (res.isErr()) {
            // throw so the Batcher re-queues and retries
            throw res.error;
        }
    }
});

export const egressTelemetryRecorder = {
    record(entry: ServerEgressTelemetry): void {
        const res = batcher.add(entry);
        if (res.isErr()) {
            logger.error(`Dropped server egress telemetry: ${res.error.message}`);
        }
    },
    async shutdown(opts?: { timeoutMs: number }): Promise<Result<void>> {
        const res = await batcher.shutdown(opts);
        if (res.isErr()) {
            logger.error(`Server egress telemetry recorder shutdown error: ${res.error.message}`);
        }

        return res;
    }
};
