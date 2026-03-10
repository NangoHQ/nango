import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok, getLogger } from '@nangohq/utils';

import { setAbortFlag } from '../execution/operations/abort.js';
import { getRoutingId } from '../utils/lambda.js';

import type { RuntimeAdapter } from './adapter.js';
import type { Fleet } from '@nangohq/fleet';
import type { NangoProps, Result } from '@nangohq/types';

const logger = getLogger('LambdaRuntimeAdapter');

const client = new LambdaClient();

interface LambdaFunction {
    arn: string;
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    constructor(private readonly fleet: Fleet) {}

    private async getFunction(nangoProps: NangoProps): Promise<LambdaFunction> {
        const routingId = getRoutingId(nangoProps);
        const node = await this.fleet.getRunningNode(routingId);
        if (node.isErr()) {
            throw new Error(`Failed to get running node for routing id '${routingId}'`, { cause: node.error });
        }
        if (!node.value.url) {
            throw new Error(`Running node for routing id '${routingId}' does not have a URL`);
        }
        return {
            arn: node.value.url
        };
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        try {
            const func = await this.getFunction(params.nangoProps);
            const payload = JSON.stringify({
                taskId: params.taskId,
                nangoProps: params.nangoProps,
                code: params.code,
                codeParams: params.codeParams
            });
            //need to check if they payload exceeds 1024 kb, if it does need to upload the paylaod to s3 and a pre-signed url
            //perhaps could use the hash of the code as the key prefixed with something like nangoProps.environmentId
            //only upload if it doesn't exist already and can just get the pre-signed url
            //
            const command = new InvokeCommand({
                FunctionName: func.arn,
                Payload: payload,
                //InvocationType is Event for async invocation, RequestResponse for sync invocation
                InvocationType: 'Event'
            });
            await client.send(command);
            return Ok(true);
        } catch (err) {
            logger.error('Lambda was unable to execute the function', err);
            return Err(new Error(`The function runtime was unable to execute the function`, { cause: err }));
        }
    }

    async cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        const result = await setAbortFlag(params.taskId);
        if (result.isErr()) {
            return Err(new Error(`Error setting abort flag for task: ${params.taskId}`, { cause: result.error }));
        }
        return Ok(true);
    }
}
