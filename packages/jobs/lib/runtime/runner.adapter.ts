import { Err, getLogger, Ok } from '@nangohq/utils';

import { getRunner, getRunners } from '../runner/runner.js';

import type { RuntimeAdapter } from './adapter.js';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('RunnerRuntimeAdapter');

export class RunnerRuntimeAdapter implements RuntimeAdapter {
    async cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        try {
            const runners = await getRunners(params.nangoProps.team.id);
            if (runners.isErr()) {
                return Err(runners.error);
            }
            const results = await Promise.allSettled(runners.value.map((runner) => runner.client.abort.mutate({ taskId: params.taskId })));
            const didAbort = results.some((result) => result.status === 'fulfilled' && result.value);
            if (!didAbort) {
                return Err(`Error aborting script for task: ${params.taskId}`);
            }
            return Ok(didAbort);
        } catch (err) {
            return Err(new Error(`Error aborting script for task: ${params.taskId}`, { cause: err }));
        }
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const runner = await getRunner(params.nangoProps.team.id);
        if (runner.isErr()) {
            return Err(runner.error);
        }

        try {
            const res = await runner.value.client.start.mutate({
                taskId: params.taskId,
                nangoProps: params.nangoProps,
                code: params.code,
                codeParams: params.codeParams
            });

            return Ok(res);
        } catch (err) {
            // Surface the cause internally: the wrapper below carries it only as `cause`, which nothing downstream logs.
            logger.error('Nango runner was unable to execute the function', {
                error: err,
                taskId: params.taskId,
                teamId: params.nangoProps.team.id,
                runnerId: runner.value.id,
                runnerUrl: runner.value.url
            });
            return Err(new Error(`Nango runner was unable to execute the function`, { cause: err }));
        }
    }
}
