import { Err, Ok } from '@nangohq/utils';

import { getRunner } from '../runner/runner.js';

import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

interface FunctionInvoker {
    invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>>;
}

class RunnerFunctionInvoker implements FunctionInvoker {
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

const runnerFunctionInvoker = new RunnerFunctionInvoker();
export async function getFunctionInvoker(_nangoProps: NangoProps): Promise<Result<FunctionInvoker>> {
    return Promise.resolve(Ok(runnerFunctionInvoker));
}
