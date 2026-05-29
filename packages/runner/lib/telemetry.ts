import { Batcher, Ok } from '@nangohq/utils';

import { telemetryBatchSize, telemetryFlushIntervalMs } from './env.js';
import { logger } from './logger.js';

import type { PersistClient } from './clients/persist.js';
import type { RunnerTelemetry } from '@nangohq/types';
import type { Grouping, Result } from '@nangohq/utils';

export interface TelemetryRecorder {
    record(entry: RunnerTelemetry): void;
    shutdown(opts?: { timeoutMs?: number }): Promise<Result<void>>;
}

const telemetryGrouping: Grouping<RunnerTelemetry> = {
    groupingKey: (event) => `${event.type}:${event.callsite}:${event.integrationId}:${event.connectionId}:${event.syncId ?? ''}`,
    aggregate: (accumulated, event) => {
        if (accumulated.type !== event.type || accumulated.callsite !== event.callsite) {
            return event; // defensive check (shouldn't happen): not the same type, cannot aggregate
        }
        const _acc = accumulated; // To satisfy ts compiler that b has the same type as a

        switch (event.type) {
            case 'data_transfer':
                return {
                    type: event.type,
                    callsite: event.callsite,
                    connectionId: event.connectionId,
                    integrationId: event.integrationId,
                    syncId: event.syncId,
                    bytesSent: Math.min(_acc.bytesSent + event.bytesSent, Number.MAX_SAFE_INTEGER),
                    bytesReceived: Math.min(_acc.bytesReceived + event.bytesReceived, Number.MAX_SAFE_INTEGER)
                };
            default:
                throw new Error(`Unsupported telemetry type: ${event.type}`);
        }
    }
};

function createTelemetryBatcher({ environmentId, persistClient }: { environmentId: number; persistClient: PersistClient }): Batcher<RunnerTelemetry> {
    return new Batcher<RunnerTelemetry>({
        maxBatchSize: telemetryBatchSize,
        flushIntervalMs: telemetryFlushIntervalMs,
        grouping: telemetryGrouping,
        process: async (events) => {
            const res = await persistClient.postRunnerTelemetry(environmentId, events);
            if (res.isErr()) {
                logger.warning('Failed to post runner telemetry, might retry later', {
                    environmentId: environmentId,
                    events,
                    reason: res.error.message
                });
                throw res.error;
            }
        }
    });
}

export function createTelemetryRecorder({
    environmentId,
    persistClient,
    exportRunnerTelemetry
}: {
    environmentId: number;
    persistClient: PersistClient;
    exportRunnerTelemetry: boolean;
}): TelemetryRecorder {
    const batcher = exportRunnerTelemetry ? createTelemetryBatcher({ environmentId, persistClient }) : undefined;

    return {
        record(entry) {
            if (!batcher) return;
            console.log(`Recording telemetry entry: ${JSON.stringify(entry)}`);
            const res = batcher.add(entry);
            if (res.isErr()) {
                logger.error(`Telemetry recorder dropped entry: ${res.error.message}`);
            }
        },
        async shutdown({ timeoutMs = 5_000 }: { timeoutMs?: number } = {}) {
            if (!batcher) return Ok(undefined);

            const res = await batcher.shutdown({ timeoutMs });
            if (res.isErr()) {
                logger.error(`Telemetry recorder shutdown error: ${res.error.message}`);
            }

            return res;
        }
    };
}
