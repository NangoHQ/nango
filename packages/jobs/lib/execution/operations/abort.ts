import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import { getRunner } from '../../runner/runner.js';

export async function abortScript({ taskId, teamId }: { taskId: string; teamId: number }): Promise<Result<void>> {
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
