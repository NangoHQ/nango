import type { Scheduler, Task } from '@nangohq/scheduler';
import { validateTask } from './clients/validate.js';
import { Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { logger } from './utils.js';

export async function scheduleAbortTask({ scheduler, task }: { scheduler: Scheduler; task: Task }): Promise<Result<Task | undefined>> {
    const aborted = validateTask(task);
    if (aborted.isOk()) {
        if (aborted.value.isSync()) {
            const reason = aborted.value.state === 'EXPIRED' ? 'Expired execution' : 'Execution was cancelled';
            const abortTask = await scheduler.immediate({
                name: `abort:${aborted.value.name}`,
                payload: {
                    type: 'abort',
                    abortedTask: {
                        id: aborted.value.id,
                        state: aborted.value.state
                    },
                    reason,
                    syncId: aborted.value.syncId,
                    syncName: aborted.value.syncName,
                    debug: aborted.value.debug,
                    connection: aborted.value.connection
                },
                groupKey: aborted.value.groupKey,
                retryMax: 0,
                retryCount: 0,
                createdToStartedTimeoutSecs: 60,
                startedToCompletedTimeoutSecs: 60,
                heartbeatTimeoutSecs: 60
            });
            if (abortTask.isErr()) {
                logger.error(`Failed to create abort task: ${stringifyError(abortTask.error)}`);
            }
        }
    }
    return Ok(undefined);
}
