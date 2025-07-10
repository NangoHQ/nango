import { environmentService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { orchestratorClient } from '../../clients.js';
import { logger } from '../../logger.js';
import { getRunner } from '../../runner/runner.js';

import type { TaskAbort } from '@nangohq/nango-orchestrator';
import type { Result } from '@nangohq/utils';

export async function abortTask(task: TaskAbort): Promise<Result<void>> {
    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
    if (!accountAndEnv) {
        return Err(`Account and environment not found`);
    }
    const { account: team } = accountAndEnv;

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
    const runner = await getRunner(teamId);
    if (runner.isErr()) {
        return Err(runner.error);
    }
    const isAborted = await runner.value.client.abort.mutate({ taskId });
    if (!isAborted) {
        return Err(`Error aborting script for task: ${taskId}`);
    }
    return Ok(undefined);
}
