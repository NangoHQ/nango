import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { Err, Ok } from '@nangohq/utils';

import type { RuntimeAdapter } from './adapter.js';
import type { Fleet } from '@nangohq/fleet';
import type { NangoProps, Result } from '@nangohq/types';

const client = new LambdaClient();

interface LambdaFunction {
    arn: string;
}

function getSize(_nangoProps: NangoProps): number {
    //based on memory return a memory size compatible with lambda
    return 256;
}

function getFunctionName(nangoProps: NangoProps): string {
    const size = getSize(nangoProps);
    return `nango-function-${size}`;
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    constructor(private readonly fleet: Fleet) {}

    canHandle(nangoProps: NangoProps): boolean {
        return nangoProps.scriptType === 'action';
        //return false;
    }

    async getFunction(nangoProps: NangoProps): Promise<LambdaFunction> {
        const routingId = getFunctionName(nangoProps);
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
        const func = await this.getFunction(params.nangoProps);
        const command = new InvokeCommand({
            FunctionName: func.arn,
            Payload: JSON.stringify({
                taskId: params.taskId,
                nangoProps: params.nangoProps,
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
