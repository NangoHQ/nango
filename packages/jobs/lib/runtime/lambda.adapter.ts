import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok, getLogger } from '@nangohq/utils';

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
            const command = new InvokeCommand({
                FunctionName: func.arn,
                Payload: JSON.stringify({
                    taskId: params.taskId,
                    nangoProps: params.nangoProps,
                    code: params.code,
                    codeParams: params.codeParams
                }),
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

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Err(new Error('Lambda functions do not support cancellation')));
    }
}
