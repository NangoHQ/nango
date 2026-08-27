import { afterEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { TaskEventsHandler } from './events.js';

import type { Task } from '@nangohq/scheduler';
import type knex from 'knex';

function buildTask(overrides: Partial<Task> = {}): Task {
    const createdAt = new Date('2026-08-27T10:00:00.000Z');
    return {
        id: 'task-1',
        name: 'webhook:1',
        payload: {},
        groupKey: 'webhook:environment:42',
        groupMaxConcurrency: 0,
        retryMax: 0,
        retryCount: 0,
        startsAfter: createdAt,
        createdToStartedTimeoutSecs: 30,
        startedToCompletedTimeoutSecs: 30,
        heartbeatTimeoutSecs: 60,
        createdAt,
        state: 'STARTED',
        lastStateTransitionAt: new Date('2026-08-27T10:00:02.500Z'),
        lastHeartbeatAt: createdAt,
        output: null,
        terminated: false,
        scheduleId: null,
        retryKey: null,
        ownerKey: null,
        ...overrides
    } as Task;
}

describe('TaskEventsHandler start lag', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function onStarted(task: Task) {
        const duration = vi.spyOn(metrics, 'duration');
        new TaskEventsHandler({} as knex.Knex).onCallbacks.STARTED(task);
        return duration;
    }

    it('reports the wait between eligibility and start, tagged by primitive', () => {
        const duration = onStarted(buildTask());

        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_START_LAG_MS, 2500, { primitive: 'webhook' });
    });

    it('measures from startsAfter so a deliberately delayed task is not counted as lagging', () => {
        const duration = onStarted(buildTask({ startsAfter: new Date('2026-08-27T10:00:02.000Z') }));

        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_START_LAG_MS, 500, { primitive: 'webhook' });
    });

    it('clamps a negative lag from clock skew to 0', () => {
        const duration = onStarted(buildTask({ startsAfter: new Date('2026-08-27T10:00:05.000Z') }));

        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_START_LAG_MS, 0, { primitive: 'webhook' });
    });

    it('falls back to a placeholder primitive for an unprefixed group key', () => {
        const duration = onStarted(buildTask({ groupKey: '' }));

        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_TASKS_START_LAG_MS, 2500, { primitive: 'unknown' });
    });
});
