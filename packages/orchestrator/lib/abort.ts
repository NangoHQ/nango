import type { Scheduler, Task } from '@nangohq/scheduler';
import { validateTask } from './clients/validate.js';
import { Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { logger } from './utils.js';
import type { JsonValue } from 'type-fest';

export async function scheduleAbortTask({ scheduler, task }: { scheduler: Scheduler; task: Task }): Promise<Result<Task>> {
    const aborted = validateTask(task);
    if (aborted.isErr()) {
        return Err(aborted.error);
    }
    const reason = aborted.value.state === 'EXPIRED' ? 'Expired execution' : 'Execution was cancelled';
    const payload: JsonValue = {
        type: 'abort',
        abortedTask: {
            id: aborted.value.id,
            state: aborted.value.state
        },
        reason,
        connection: aborted.value.connection
    };
    const abortTask = await scheduler.immediate({
        name: `abort:${aborted.value.name}`,
        payload: aborted.value.isSync()
            ? {
                  ...payload,
                  syncId: aborted.value.syncId,
                  syncName: aborted.value.syncName,
                  debug: aborted.value.debug
              }
            : payload,
        groupKey: aborted.value.groupKey,
        retryMax: 0,
        retryCount: 0,
        createdToStartedTimeoutSecs: 60,
        startedToCompletedTimeoutSecs: 60,
        heartbeatTimeoutSecs: 60
    });
    if (abortTask.isErr()) {
        logger.error(`Failed to create abort task`, abortTask.error);
        return Err(abortTask.error);
    }
    return abortTask;
}
