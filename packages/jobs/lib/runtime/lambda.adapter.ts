import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';

import type { RuntimeAdapter } from './adapter.js';
import type { NangoProps, Result } from '@nangohq/types';

const client = new LambdaClient();

function getLambdaFunctionName(_nangoProps: NangoProps): string {
    //return `nango-function-${nangoProps.scriptType}-128mb`;
    return envs.LAMBDA_FUNCTION_NAME;
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    canHandle(nangoProps: NangoProps): boolean {
        return nangoProps.scriptType === 'action';
        //return false;
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const functionName = getLambdaFunctionName(params.nangoProps);
        const command = new InvokeCommand({
            FunctionName: functionName,
            Qualifier: envs.LAMBDA_FUNCTION_QUALIFIER,
            Payload: JSON.stringify({
                taskId: params.taskId,
                nangoProps: {
                    connectionId: params.nangoProps.connectionId,
                    providerConfigKey: params.nangoProps.providerConfigKey
                },
                code: Buffer.from(params.code).toString('base64'),
                codeParams: params.codeParams
            }),
            InvocationType: 'Event'
        });
        await client.send(command);
        return Ok(true);
    }

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Err(new Error('Lambda functions do not support cancellation')));
    }
}
