import type { Scheduler, Task } from '@nangohq/scheduler';
import { validateTask } from './clients/validate.js';
import { Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { logger } from './utils.js';

export async function scheduleAbortTask({ scheduler, task }: { scheduler: Scheduler; task: Task }): Promise<Result<Task | undefined>> {
    const cancelled = validateTask(task);
    if (cancelled.isOk()) {
        if (cancelled.value.isSync()) {
            const reason = cancelled.value.state === 'EXPIRED' ? 'Expired execution' : 'Execution was cancelled';
            const cancelTask = await scheduler.immediate({
                name: `abort:${cancelled.value.name}`,
                payload: {
                    type: 'abort',
                    abortedTask: {
                        id: cancelled.value.id,
                        state: cancelled.value.state
                    },
                    reason,
                    syncId: cancelled.value.syncId,
                    syncName: cancelled.value.syncName,
                    debug: cancelled.value.debug,
                    connection: cancelled.value.connection
                },
                groupKey: cancelled.value.groupKey,
                retryMax: 0,
                retryCount: 0,
                createdToStartedTimeoutSecs: 60,
                startedToCompletedTimeoutSecs: 60,
                heartbeatTimeoutSecs: 60
            });
            if (cancelTask.isErr()) {
                logger.error(`Failed to create cancel task: ${stringifyError(cancelTask.error)}`);
            }
        }
    }
    return Ok(undefined);
}
