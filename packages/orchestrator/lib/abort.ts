import type { Scheduler, Task } from '@nangohq/scheduler';
import { validateTask } from './clients/validate.js';
import { Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { logger } from './utils.js';
import type { JsonValue } from 'type-fest';

export async function scheduleAbortTask({ scheduler, task, reason }: { scheduler: Scheduler; task: Task; reason: string }): Promise<Result<Task>> {
    const aborted = validateTask(task);
    if (aborted.isErr()) {
        return Err(aborted.error);
    }

    // we don't want to abort an abort task
    if (aborted.value.isAbort() || aborted.value.isSyncAbort()) {
        return Err(`Task is already an abort task`);
    }

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
