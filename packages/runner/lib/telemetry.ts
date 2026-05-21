import { Batcher, Ok } from '@nangohq/utils';

import { telemetryBatchSize, telemetryFlushIntervalMs } from './env.js';
import { logger } from './logger.js';

import type { PersistClient } from './clients/persist.js';
import type { RunnerTelemetry } from '@nangohq/types';
import type { Grouping, Result } from '@nangohq/utils';

export interface TelemetryRecorder {
    environmentId: number;
    record(entry: RunnerTelemetry): void;
    shutdown(opts?: { timeoutMs?: number }): Promise<Result<void>>;
}

const telemetryGrouping: Grouping<RunnerTelemetry> = {
    groupingKey: (event) => `${event.type}:${event.integrationId}:${event.connectionId}`,
    aggregate: (accumulated, event) => {
        if (accumulated.type !== event.type) {
            return event; // defensive check (shouldn't happen): not the same type, cannot aggregate
        }
        const _acc = accumulated; // To satisfy ts compiler that b has the same type as a

        switch (event.type) {
            case 'data_transfer':
                return {
                    type: event.type,
                    connectionId: event.connectionId,
                    integrationId: event.integrationId,
                    bytesSent: _acc.bytesSent + event.bytesSent,
                    bytesReceived: _acc.bytesReceived + event.bytesReceived
                };
            default:
                throw new Error(`Unsupported telemetry type: ${event.type}`);
        }
    }
};

function createTelemetryBatcher({ environmentId, persistClient }: { environmentId: number; persistClient: PersistClient }): Batcher<RunnerTelemetry> {
    const batcher = new Batcher<RunnerTelemetry>({
        maxBatchSize: telemetryBatchSize,
        flushIntervalMs: telemetryFlushIntervalMs,
        grouping: telemetryGrouping,
        // eslint-disable-next-line @typescript-eslint/require-await
        process: async (events) => {
            void persistClient.postRunnerTelemetry(environmentId, events).then((res) => {
                if (res.isErr()) {
                    logger.error(`Failed to post runner telemetry: ${res.error.message}`, { environmentId, events });
                }
            });

            // NOTE: we're not awaiting/throwing here, so the batcher will not retry deliveries when requests fail.
            // (Batcher retries processing events if the `process` method throws).
            // Awaiting could impact runners performance, so while we're only instrumenting DD custom metrics, this is ok.
            // We need to consider the long-term solution: do we await to guarantee billing accuracy and risk impacting performance?
            // A possible compromise would be to await with a low timeout to mitigate performance impact while still retrying on failures.
        }
    });

    return batcher;
}

export function createTelemetryRecorder({ environmentId, persistClient }: { environmentId: number; persistClient: PersistClient }): TelemetryRecorder {
    const batcher = createTelemetryBatcher({ environmentId, persistClient });

    return {
        environmentId,
        record(entry) {
            const res = batcher.add(entry);
            if (res.isErr()) {
                logger.error(`Telemetry recorder dropped entry: ${res.error.message}`);
            }
        },
        async shutdown({ timeoutMs = 5_000 }: { timeoutMs?: number } = {}) {
            const res = await batcher.shutdown({ timeoutMs });
            if (res.isErr()) {
                logger.error(`Telemetry recorder shutdown error: ${res.error.message}`);
                return res;
            }
            return Ok(undefined);
        }
    };
}
