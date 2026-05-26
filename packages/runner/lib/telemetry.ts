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
    allInFlightLanded: (waitFor: number) => Promise<boolean>;
} {
    const inFlight = new Set<Promise<void>>();

    const batcher = new Batcher<RunnerTelemetry>({
        maxBatchSize: telemetryBatchSize,
        flushIntervalMs: telemetryFlushIntervalMs,
        grouping: telemetryGrouping,
        // eslint-disable-next-line @typescript-eslint/require-await
        process: async (events) => {
            // fire-and-forget to avoid blocking runner script execution.
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

    const allInFlightLanded = async (waitFor: number): Promise<boolean> => {
        if (inFlight.size === 0) return true;
        if (waitFor <= 0) return false;

        let timerId: NodeJS.Timeout;
        let timedOut = false;
        const timer = new Promise(
            (resolve) =>
                (timerId = setTimeout(() => {
                    timedOut = true;
                    resolve(null);
                }, waitFor))
        );
        await Promise.race([Promise.allSettled([...inFlight]), timer]);
        clearTimeout(timerId!);
        return !timedOut;
    };

    return { batcher, allInFlightLanded };
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
    const { batcher, allInFlightLanded } = exportRunnerTelemetry ? createTelemetryBatcher({ environmentId, persistClient }) : {};

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
            if (!batcher || !allInFlightLanded) return Ok(undefined);

            const start = Date.now();
            const res = await batcher.shutdown({ timeoutMs });
            if (res.isErr()) {
                logger.error(`Telemetry recorder shutdown error: ${res.error.message}`);
                return res;
            }

            const timeRemaining = timeoutMs - (Date.now() - start);
            if (!(await allInFlightLanded(timeRemaining))) {
                logger.warning(`Not all in-flight telemetry entries landed within ${timeoutMs}ms`);
            }

            return Ok(undefined);
        }
    };
}
