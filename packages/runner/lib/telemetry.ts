import { Batcher, Ok } from '@nangohq/utils';

import { logger } from './logger.js';

import type { PersistClient } from './clients/persist.js';
import type { RunnerTelemetry } from '@nangohq/types';
import type { Grouping, Result } from '@nangohq/utils';

export interface TelemetryRecorder {
    record(entry: RunnerTelemetry): void;
    shutdown(opts?: { timeoutMs?: number }): Promise<Result<void>>;
}

export interface TelemetryRecorderConfig {
    environmentId: number;
    persistClient: PersistClient;
    telemetryBatchSize: number;
    telemetryFlushIntervalMs: number;
    recordingEnabled?: boolean;
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

function createTelemetryBatcher(config: Omit<TelemetryRecorderConfig, 'recordingEnabled'>): Batcher<RunnerTelemetry> {
    return new Batcher<RunnerTelemetry>({
        maxBatchSize: config.telemetryBatchSize,
        flushIntervalMs: config.telemetryFlushIntervalMs,
        grouping: telemetryGrouping,
        process: async (events) => {
            const res = await config.persistClient.postRunnerTelemetry(config.environmentId, events);
            if (res.isErr()) {
                logger.warning('Failed to post runner telemetry, might retry later', {
                    environmentId: config.environmentId,
                    events,
                    reason: res.error.message
                });
                throw res.error;
            }
        }
    });
}

export function createTelemetryRecorder(config: TelemetryRecorderConfig): TelemetryRecorder {
    const batcher = config.recordingEnabled ? createTelemetryBatcher(config) : undefined;

    return {
        record(entry) {
            if (!batcher) return;
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
