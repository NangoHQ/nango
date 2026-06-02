/**
 * Public surface for configuring the Scheduler. The package reads no environment variables
 * itself; consumers either pass an explicit SchedulerConfig or rely on defaultSchedulerConfig.
 *
 * Defaults below mirror the historical orchestrator env defaults so callers that previously
 * relied on env-driven behavior get the same numbers.
 */

import type { StrictLogger } from '@nangohq/utils';

export interface SchedulerConfig {
    readonly daemons: {
        readonly schedulingTickIntervalMs: number;
        readonly expiringTickIntervalMs: number;
        readonly cleaningTickIntervalMs: number;
        readonly monitoringTickIntervalMs: number;
        readonly cleaningOlderThanDays: number;
        readonly monitoringTopN: number;
    };
    readonly limits: {
        readonly groupTaskCap: number;
        readonly expiringBatchSize: number;
        // Concurrency stamped on tasks materialized from a recurring schedule.
        // PR B will move this onto the schedule row itself; until then it is a single global value.
        readonly recurringGroupMaxConcurrency: number;
    };
}

export interface SchedulerStartOptions {
    readonly scheduling?: boolean;
    readonly expiring?: boolean;
    readonly cleaning?: boolean;
    readonly backpressure?: boolean;
}

export const defaultSchedulerConfig: SchedulerConfig = {
    daemons: {
        schedulingTickIntervalMs: 100,
        expiringTickIntervalMs: 1000,
        cleaningTickIntervalMs: 10_000,
        monitoringTickIntervalMs: 10_000,
        cleaningOlderThanDays: 5,
        monitoringTopN: 10
    },
    limits: {
        groupTaskCap: 10_000,
        expiringBatchSize: 1000,
        recurringGroupMaxConcurrency: 500
    }
};

export const defaultSchedulerStartOptions: Required<SchedulerStartOptions> = {
    scheduling: true,
    expiring: true,
    cleaning: true,
    backpressure: true
};

/**
 * Operational events emitted by the scheduler. Consumers decide whether to turn these into
 * metrics, logs, alerts, or nothing.
 */
export type SchedulerEvent =
    | { type: 'task_dropped'; groupKey: string; count: number; reason: 'task_cap' }
    | { type: 'queue_backpressure'; groupKey: string; queued: number };

const noop = (() => undefined) as unknown as StrictLogger['info'];

export const noopLogger: StrictLogger = {
    error: noop,
    warning: noop,
    info: noop,
    debug: noop,
    close: () => undefined
};
