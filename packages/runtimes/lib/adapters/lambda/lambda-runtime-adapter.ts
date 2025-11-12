import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok } from '@nangohq/utils';

import type { RuntimeAdapter } from '../../runtime-adapter.js';
import type { NangoProps, Result } from '@nangohq/types';

const client = new LambdaClient();

function getLambdaFunctionName(_nangoProps: NangoProps): string {
    //return `nango-function-${nangoProps.scriptType}-128mb`;
    return 'lambda-function:4';
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    canHandle(nangoProps: NangoProps): boolean {
        return nangoProps.scriptType === 'action';
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const functionName = getLambdaFunctionName(params.nangoProps);
        const command = new InvokeCommand({
            FunctionName: functionName,
            Payload: JSON.stringify({
                taskId: params.taskId,
                nangoProps: params.nangoProps,
                code: params.code,
                codeParams: params.codeParams
            })
        });
        const response = await client.send(command);
        return Ok(response.StatusCode === 200);
    }

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Err(new Error('Lambda functions do not support cancellation')));
    }
}
