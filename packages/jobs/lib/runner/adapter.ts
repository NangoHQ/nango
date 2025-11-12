import { Err, Ok } from '@nangohq/utils';

import { getRunner } from './runner.js';

import type { RuntimeAdapter } from '@nangohq/runtimes';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class RunnerRuntimeAdapter implements RuntimeAdapter {
    async cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        try {
            const runner = await getRunner(params.nangoProps.team.id);
            if (runner.isErr()) {
                return Err(runner.error);
            }
            const isAborted = await runner.value.client.abort.mutate({ taskId: params.taskId });
            if (!isAborted) {
                return Err(`Error aborting script for task: ${params.taskId}`);
            }
            return Ok(isAborted);
        } catch (err) {
            return Err(new Error(`Error aborting script for task: ${params.taskId}`, { cause: err }));
        }
    }

    canHandle(_nangoProps: NangoProps): boolean {
        return true;
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const runner = await getRunner(params.nangoProps.team.id);
        if (runner.isErr()) {
            return Err(runner.error);
        }

        const res = await runner.value.client.start.mutate({
            taskId: params.taskId,
            nangoProps: params.nangoProps,
            code: params.code,
            codeParams: params.codeParams
        });

        return Ok(res);
    }
}
