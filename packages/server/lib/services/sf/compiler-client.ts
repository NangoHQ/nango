import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import type { CLIDeployFlowConfig } from '@nangohq/types';

// TODO: move to env var (SF_COMPILER_LAMBDA_NAME) once past the testing phase
const SF_COMPILER_FUNCTION_NAME = 'nango-sf-compiler-test';

const lambdaClient = new LambdaClient({});

export interface CompileResult {
    bundledJs: string;
    flow: CLIDeployFlowConfig;
}

export class SfCompilerError extends Error {
    public readonly step: 'validation' | 'compilation';

    constructor(message: string, step: 'validation' | 'compilation', remoteStack?: string) {
        super(message);
        this.name = 'SfCompilerError';
        this.step = step;
        if (remoteStack !== undefined) {
            this.stack = remoteStack;
        }
    }
}

export async function invokeCompiler({
    integration_id,
    function_name,
    function_type,
    code
}: {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
}): Promise<CompileResult> {
    const response = await lambdaClient.send(
        new InvokeCommand({
            FunctionName: SF_COMPILER_FUNCTION_NAME,
            InvocationType: 'RequestResponse',
            Payload: Buffer.from(JSON.stringify({ integration_id, function_name, function_type, code }))
        })
    );

    if (response.FunctionError) {
        throw new Error(`sf-compiler Lambda invocation failed (${response.FunctionError})`);
    }

    if (!response.Payload) {
        throw new Error('sf-compiler Lambda returned an empty payload');
    }

    const body = JSON.parse(Buffer.from(response.Payload).toString('utf8')) as
        | { success: true; bundledJs: string; flow: CLIDeployFlowConfig }
        | { success: false; step: 'validation' | 'compilation'; message: string; stack?: string };

    if (!body.success) {
        throw new SfCompilerError(body.message, body.step, body.stack);
    }

    return { bundledJs: body.bundledJs, flow: body.flow };
}
