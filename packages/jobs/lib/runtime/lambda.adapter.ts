import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { getJobsUrl } from '@nangohq/shared';
import { Err, Ok, retryWithBackoff } from '@nangohq/utils';

import type { RuntimeAdapter } from './adapter.js';
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

export async function updateTask({
    taskId,
    nangoProps,
    isSuccess,
    output
}: {
    taskId: string;
    nangoProps: NangoProps;
    isSuccess: boolean;
    output: any;
}): Promise<Response> {
    const url = `${getJobsUrl()}/tasks/${taskId}`;
    const init = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            nangoProps: nangoProps,
            ...(isSuccess ? { output } : { error: output })
        })
    };
    try {
        const response = await retryWithBackoff(async () => {
            let res: Response;
            try {
                res = await fetch(url, init);
            } catch (err) {
                console.error(`${init.method} ${url.toString()} -> ${(err as Error).message}`);
                throw err;
            }

            if (!res.ok) {
                console.error(`${init.method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            // Retry only on 5xx or 429 responses
            if (res.status >= 500 || res.status === 429) {
                throw new Error(`${init.method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            return res;
        });

        return response;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
            status: 599,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
