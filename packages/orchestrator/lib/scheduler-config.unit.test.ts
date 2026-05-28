import { describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { buildSchedulerConfig, handleSchedulerEvent } from './scheduler-config.js';

import type { ENVS, parseEnvs } from '@nangohq/utils';

type Envs = ReturnType<typeof parseEnvs<typeof ENVS>>;

describe('buildSchedulerConfig', () => {
    it('maps every env field to its scheduler config slot', () => {
        const envs = {
            ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS: 111,
            ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS: 222,
            ORCHESTRATOR_CLEANING_TICK_INTERVAL_MS: 333,
            ORCHESTRATOR_BACKPRESSURE_MONITORING_TICK_INTERVAL_MS: 444,
            ORCHESTRATOR_CLEANING_OLDER_THAN_DAYS: 7,
            ORCHESTRATOR_BACKPRESSURE_MONITORING_TOP_N: 9,
            ORCHESTRATOR_TASK_CREATED_PER_GROUP_COUNT_MAX: 8888,
            ORCHESTRATOR_EXPIRING_TASKS_BATCH_SIZE: 555,
            SYNC_ENVIRONMENT_MAX_CONCURRENCY: 77
        } as unknown as Envs;

        expect(buildSchedulerConfig(envs)).toEqual({
            daemons: {
                schedulingTickIntervalMs: 111,
                expiringTickIntervalMs: 222,
                cleaningTickIntervalMs: 333,
                monitoringTickIntervalMs: 444,
                cleaningOlderThanDays: 7,
                monitoringTopN: 9
            },
            limits: {
                groupTaskCap: 8888,
                expiringBatchSize: 555,
                recurringGroupMaxConcurrency: 77
            }
        });
    });
});

describe('handleSchedulerEvent', () => {
    it('translates task_dropped to ORCH_TASKS_DROPPED with primitive + reason tags', () => {
        const spy = vi.spyOn(metrics, 'increment').mockImplementation(() => {});

        handleSchedulerEvent({ type: 'task_dropped', groupKey: 'sync:environment:1', count: 3, reason: 'task_cap' });

        expect(spy).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_DROPPED, 3, { primitive: 'sync', reason: 'task_cap' });
        spy.mockRestore();
    });

    it('defaults primitive to "unknown" when the group key has no separator', () => {
        const spy = vi.spyOn(metrics, 'increment').mockImplementation(() => {});

        handleSchedulerEvent({ type: 'task_dropped', groupKey: '', count: 1, reason: 'task_cap' });

        expect(spy).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_DROPPED, 1, { primitive: 'unknown', reason: 'task_cap' });
        spy.mockRestore();
    });

    it('translates queue_backpressure to ORCH_QUEUE_BACKPRESSURE gauge with primitive + groupKey tags', () => {
        const spy = vi.spyOn(metrics, 'gauge').mockImplementation(() => {});

        handleSchedulerEvent({ type: 'queue_backpressure', groupKey: 'sync:environment:42', queued: 17 });

        expect(spy).toHaveBeenCalledWith(metrics.Types.ORCH_QUEUE_BACKPRESSURE, 17, { groupKey: 'sync:environment:42', primitive: 'sync' });
        spy.mockRestore();
    });
});
