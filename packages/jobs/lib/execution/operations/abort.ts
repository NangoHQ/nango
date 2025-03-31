import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import { getRunner } from '../../runner/runner.js';
import { environmentService } from '@nangohq/shared';
import { logger } from '../../logger.js';
import type { TaskAbort } from '@nangohq/nango-orchestrator';

export async function abortTask(task: TaskAbort): Promise<Result<void>> {
    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
    if (!accountAndEnv) {
        return Err(`Account and environment not found`);
    }
    const { account: team } = accountAndEnv;

    const abortedScript = await abortTaskWithId({ taskId: task.abortedTask.id, teamId: team.id });
    if (abortedScript.isErr()) {
        logger.error(`failed to abort script for task ${task.abortedTask.id}`, abortedScript.error);
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
