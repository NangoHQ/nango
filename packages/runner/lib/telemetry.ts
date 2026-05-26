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
                    bytesSent: Math.min(_acc.bytesSent + event.bytesSent, Number.MAX_SAFE_INTEGER),
                    bytesReceived: Math.min(_acc.bytesReceived + event.bytesReceived, Number.MAX_SAFE_INTEGER)
                };
            default:
                throw new Error(`Unsupported telemetry type: ${event.type}`);
        }
    }
};

function createTelemetryBatcher({ environmentId, persistClient }: { environmentId: number; persistClient: PersistClient }): {
    batcher: Batcher<RunnerTelemetry>;
    waitForInFlights: () => Promise<void>;
} {
    const inFlight = new Set<Promise<unknown>>();

    const batcher = new Batcher<RunnerTelemetry>({
        maxBatchSize: telemetryBatchSize,
        flushIntervalMs: telemetryFlushIntervalMs,
        grouping: telemetryGrouping,
        // eslint-disable-next-line @typescript-eslint/require-await
        process: async (events) => {
            // Fire-and-forget to avoid blocking runner script execution.
            const p = persistClient
                .postRunnerTelemetry(environmentId, events)
                .then((res) => {
                    if (res.isErr()) {
                        logger.error(`Failed to post runner telemetry: ${res.error.message}`, { environmentId, events });
                    }
                })
                .finally(() => inFlight.delete(p));
            inFlight.add(p);
        }
    });

    const waitForInFlights = async (): Promise<void> => {
        await Promise.allSettled([...inFlight]);
    };

    return { batcher, waitForInFlights };
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
    const { batcher, waitForInFlights } = exportRunnerTelemetry ? createTelemetryBatcher({ environmentId, persistClient }) : {};

    return {
        environmentId,
        record(entry) {
            if (!batcher) return;
            const res = batcher.add(entry);
            if (res.isErr()) {
                logger.error(`Telemetry recorder dropped entry: ${res.error.message}`);
            }
        },
        async shutdown({ timeoutMs = 5_000 }: { timeoutMs?: number } = {}) {
            if (!batcher || !waitForInFlights) return Ok(undefined);
            const start = Date.now();
            const res = await batcher.shutdown({ timeoutMs });
            if (res.isErr()) {
                logger.error(`Telemetry recorder shutdown error: ${res.error.message}`);
                return res;
            }
            const remaining = timeoutMs - (Date.now() - start);
            if (remaining > 0) {
                await Promise.race([waitForInFlights(), new Promise<void>((resolve) => setTimeout(resolve, remaining))]);
            }
            return Ok(undefined);
        }
    };
}
