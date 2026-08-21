import db from '@nangohq/database';
import { PersistClient } from '@nangohq/nango-runner';
import { accountService, secretService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { orchestratorClient } from '../../clients.js';
import { logger } from '../../logger.js';
import { getRunners } from '../../runner/runner.js';
import { setTaskSuccess } from './state.js';

import type { TaskAbort } from '@nangohq/nango-orchestrator';
import type { Result } from '@nangohq/utils';

export async function abortTask(task: TaskAbort): Promise<Result<void>> {
    const accountRes = await accountService.getAccountContext({ environmentId: task.connection.environment_id });
    if (!accountRes) {
        return Err(`Account and environment not found`);
    }
    const { account: team } = accountRes;

    const abortedScript = await abortTaskWithId({
        taskId: task.abortedTask.id,
        teamId: team.id,
        environmentId: task.connection.environment_id
    });

    if (abortedScript.isErr()) {
        logger.error(`failed to abort script for task ${task.abortedTask.id}`, abortedScript.error);
        const error = new Error(`Failed to cancel`, { cause: abortedScript.error });
        const setFailed = await orchestratorClient.failed({ taskId: task.id, error });
        if (setFailed.isErr()) {
            logger.error(`failed to set cancel task ${task.id} as failed`, setFailed.error);
        }
        return Err(error);
    }

    await setTaskSuccess({ taskId: task.id, output: {} });

    return Ok(undefined);
}

export async function abortTaskWithId({ taskId, teamId, environmentId }: { taskId: string; teamId: number; environmentId: number }): Promise<Result<void>> {
    try {
        const abortFlag = await setAbortFlag({ taskId, environmentId });
        if (abortFlag.isErr()) {
            logger.error('Error setting abort flag for task, continuing to broadcast to runners', { err: abortFlag.error, taskId });
        }
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

export async function setAbortFlag({ taskId, environmentId }: { taskId: string; environmentId: number }): Promise<Result<void>> {
    try {
        const accountRes = await accountService.getAccountContext({ environmentId });
        if (!accountRes) {
            return Err(new Error(`Error setting abort flag for task: ${taskId}: environment not found`));
        }

        const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, accountRes.environment);
        if (defaultSecret.isErr()) {
            return Err(new Error(`Error setting abort flag for task: ${taskId}`, { cause: defaultSecret.error }));
        }

        const persistClient = new PersistClient({ secretKey: defaultSecret.value.secret });
        const result = await persistClient.putTaskAbort({ environmentId, taskId });
        if (result.isErr()) {
            logger.error(`Error setting abort flag for task: ${taskId}`, result.error);
            return Err(new Error(`Error setting abort flag for task: ${taskId}`, { cause: result.error }));
        }
        return Ok(undefined);
    } catch (err) {
        logger.error(`Error setting abort flag for task: ${taskId}`, err);
        return Err(new Error(`Error setting abort flag for task: ${taskId}`, { cause: err }));
    }
}
