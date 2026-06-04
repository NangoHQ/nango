import { metrics } from '@nangohq/utils';

import { logger } from './utils.js';

import type { SchedulerConfig, SchedulerEvent } from '@nangohq/scheduler';
import type { ENVS, parseEnvs } from '@nangohq/utils';

type Envs = ReturnType<typeof parseEnvs<typeof ENVS>>;

export const GROUP_PREFIX_SEPARATOR = ':';

export function buildSchedulerConfig(envs: Envs): SchedulerConfig {
    return {
        daemons: {
            schedulingTickIntervalMs: envs.ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS,
            expiringTickIntervalMs: envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS,
            cleaningTickIntervalMs: envs.ORCHESTRATOR_CLEANING_TICK_INTERVAL_MS,
            monitoringTickIntervalMs: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TICK_INTERVAL_MS,
            cleaningOlderThanDays: envs.ORCHESTRATOR_CLEANING_OLDER_THAN_DAYS,
            monitoringTopN: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TOP_N
        },
        limits: {
            groupTaskCap: envs.ORCHESTRATOR_TASK_CREATED_PER_GROUP_COUNT_MAX,
            expiringBatchSize: envs.ORCHESTRATOR_EXPIRING_TASKS_BATCH_SIZE,
            recurringGroupMaxConcurrency: envs.SYNC_ENVIRONMENT_MAX_CONCURRENCY
        }
    };
}

export function handleSchedulerEvent(event: SchedulerEvent): void {
    switch (event.type) {
        case 'task_dropped': {
            const primitive = event.groupKey.split(GROUP_PREFIX_SEPARATOR)[0] || 'unknown';
            logger.warning(`Dropped ${event.count} task(s) for group '${event.groupKey}' (reason: ${event.reason})`);
            metrics.increment(metrics.Types.ORCH_TASKS_DROPPED, event.count, { primitive, reason: event.reason });
            return;
        }
        case 'queue_backpressure': {
            const primitive = event.groupKey.split(GROUP_PREFIX_SEPARATOR)[0]!;
            metrics.gauge(metrics.Types.ORCH_QUEUE_BACKPRESSURE, event.queued, { groupKey: event.groupKey, primitive });
            return;
        }
    }
}
