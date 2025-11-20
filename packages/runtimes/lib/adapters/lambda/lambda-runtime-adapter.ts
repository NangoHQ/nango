import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok } from '@nangohq/utils';

import { updateTask } from '../../utils/tasks.js';

import type { RuntimeAdapter } from '../../runtime-adapter.js';
import type { NangoProps, Result } from '@nangohq/types';

const client = new LambdaClient();

function getLambdaFunctionName(_nangoProps: NangoProps): string {
    //return `nango-function-${nangoProps.scriptType}-128mb`;
    return 'lambda-function';
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    canHandle(_nangoProps: NangoProps): boolean {
        //return nangoProps.scriptType === 'action';
        return false;
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const functionName = getLambdaFunctionName(params.nangoProps);
        const command = new InvokeCommand({
            FunctionName: functionName,
            Qualifier: '4',
            Payload: JSON.stringify({
                taskId: params.taskId,
                nangoProps: {
                    connectionId: params.nangoProps.connectionId,
                    providerConfigKey: params.nangoProps.providerConfigKey
                },
                code: Buffer.from(params.code).toString('base64'),
                codeParams: params.codeParams
            })
        });
        const response = await client.send(command);
        const isSuccess = response.StatusCode == 200;
        const output = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString('utf-8')) : null;
        await updateTask({
            taskId: params.taskId,
            nangoProps: params.nangoProps,
            isSuccess,
            output
        });

        return Ok(true);
    }

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Err(new Error('Lambda functions do not support cancellation')));
    }
}
