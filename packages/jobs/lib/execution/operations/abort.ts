import { getKVStore } from '@nangohq/kvstore';
import { accountService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { orchestratorClient } from '../../clients.js';
import { envs } from '../../env.js';
import { logger } from '../../logger.js';
import { getRunners } from '../../runner/runner.js';

import type { TaskAbort } from '@nangohq/nango-orchestrator';
import type { Result } from '@nangohq/utils';

export async function abortTask(task: TaskAbort): Promise<Result<void>> {
    const accountRes = await accountService.getAccountContext({ environmentId: task.connection.environment_id });
    if (!accountRes) {
        return Err(`Account and environment not found`);
    }
    const { account: team } = accountRes;

    const abortedScript = await abortTaskWithId({ taskId: task.abortedTask.id, teamId: team.id });

    if (abortedScript.isErr()) {
        logger.error(`failed to abort script for task ${task.abortedTask.id}`, abortedScript.error);
        const error = new Error(`Failed to cancel`, { cause: abortedScript.error });
        const setFailed = await orchestratorClient.failed({ taskId: task.id, error });
        if (setFailed.isErr()) {
            logger.error(`failed to set cancel task ${task.id} as failed`, setFailed.error);
        }
    }

    const setSuccess = await orchestratorClient.succeed({ taskId: task.id, output: {} });
    if (setSuccess.isErr()) {
        logger.error(`failed to set cancel task ${task.id} as succeeded`, setSuccess.error);
    }
    return abortedScript;
}

export async function abortTaskWithId({ taskId, teamId }: { taskId: string; teamId: number }): Promise<Result<void>> {
    try {
        await setAbortFlag(taskId);
        // Broadcast abort to all runners as a task might still be running on a different active runner during/after rollouts (e.g. deploying a new runner version).
        const runners = await getRunners(teamId);
        if (runners.isErr()) {
            return Err(runners.error);
        }

        const results = await Promise.allSettled(runners.value.map((runner) => runner.client.abort.mutate({ taskId })));
        const didAbort = results.some((result) => result.status === 'fulfilled' && result.value);

        if (!didAbort) {
            return Err(`Error aborting script for task: ${taskId}`);
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Error aborting script for task: ${taskId}`, { cause: err }));
    }
}

async function setAbortFlag(taskId: string): Promise<void> {
    try {
        const kvStore = await getKVStore('customer');
        await kvStore.set(`function:${taskId}:abort`, '1', { ttlMs: envs.RUNNER_ABORT_CHECK_INTERVAL_MS * 5 });
    } catch (err) {
        logger.error(`Error setting abort flag for task: ${taskId}`, err);
    }
}
