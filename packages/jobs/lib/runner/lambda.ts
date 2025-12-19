import {
    CreateAliasCommand,
    CreateFunctionCommand,
    DeleteFunctionCommand,
    GetAliasCommand,
    GetProvisionedConcurrencyConfigCommand,
    LambdaClient,
    PublishVersionCommand,
    PutProvisionedConcurrencyConfigCommand,
    UpdateAliasCommand,
    waitUntilFunctionActive,
    waitUntilPublishedVersionActive
} from '@aws-sdk/client-lambda';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Environment } from '@aws-sdk/client-lambda';
import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

const lambdaClient = new LambdaClient();

export function getFunctionName(node: Node): string {
    return `${node.routingId}-${node.id}`;
}

function getSize(node: Node): number {
    //based on memory return a memory size compatible with lambda
    const memoryMb = node.memoryMb;
    if (memoryMb <= 256) return 256;
    if (memoryMb <= 512) return 512;
    if (memoryMb <= 1024) return 1024;
    if (memoryMb <= 2048) return 2048;
    if (memoryMb <= 4096) return 4096;
    if (memoryMb <= 8192) return 8192;
    return 10240;
}

export function getFunctionQualifier(node: Node): string {
    //need to get the qualifier from the function url
    const regex = /^arn:aws:lambda:.*:function:nango-function-\d+-[a-f0-9-]+:.*$/;
    const match = node.url?.match(regex);
    if (!match || match.length < 2) {
        throw new Error('Invalid URL');
    }
    return match[1]!;
}

async function waitUntilProvisionedConcurrencyReady(params: { functionName: string; qualifier: string; maxWaitTimeMs: number }): Promise<void> {
    const { functionName, qualifier, maxWaitTimeMs } = params;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTimeMs) {
        const gpcResult = await lambdaClient.send(
            new GetProvisionedConcurrencyConfigCommand({
                FunctionName: functionName,
                Qualifier: qualifier
            })
        );
        if (gpcResult.Status === 'READY') {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Provisioned concurrency not ready for function ${functionName} and qualifier ${qualifier} after ${maxWaitTimeMs}ms`);
}

class Lambda {
    private static instance: Lambda | null = null;

    private constructor() {
        // Private constructor to prevent direct instantiation
    }

    static getInstance(): Lambda {
        if (!Lambda.instance) {
            Lambda.instance = new Lambda();
        }
        return Lambda.instance;
    }

    async createFunction(node: Node): Promise<Result<void>> {
        const name = getFunctionName(node);
        const createFunctionCommand = new CreateFunctionCommand({
            FunctionName: name,
            Role: envs.LAMBDA_EXECUTION_ROLE_ARN,
            Code: {
                ImageUri: `${envs.LAMBDA_ECR_REGISTRY}/${node.image}`
            },
            PackageType: 'Image',
            Architectures: [envs.LAMBDA_ARCHITECTURE],
            MemorySize: getSize(node),
            Timeout: node.executionTimeoutSecs || envs.LAMBDA_EXECUTION_TIMEOUT_SECS,
            Environment: this.getEnvironmentVariables(node),
            VpcConfig: {
                SubnetIds: envs.LAMBDA_SUBNET_IDS,
                SecurityGroupIds: envs.LAMBDA_SECURITY_GROUP_IDS
            }
        });
        const cfResult = await lambdaClient.send(createFunctionCommand);
        await waitUntilFunctionActive(
            { client: lambdaClient, maxWaitTime: envs.LAMBDA_CREATE_TIMEOUT_SECS },
            {
                FunctionName: cfResult.FunctionName
            }
        );
        const publishVersionCommand = new PublishVersionCommand({
            FunctionName: cfResult.FunctionName
        });
        const pvResult = await lambdaClient.send(publishVersionCommand);
        await waitUntilPublishedVersionActive(
            { client: lambdaClient, maxWaitTime: envs.LAMBDA_CREATE_TIMEOUT_SECS },
            {
                FunctionName: pvResult.FunctionName,
                Qualifier: pvResult.Version
            }
        );
        try {
            await lambdaClient.send(
                new GetAliasCommand({
                    FunctionName: pvResult.FunctionName,
                    Name: envs.LAMBDA_FUNCTION_ALIAS
                })
            );
            await lambdaClient.send(
                new UpdateAliasCommand({
                    FunctionName: pvResult.FunctionName,
                    Name: envs.LAMBDA_FUNCTION_ALIAS,
                    FunctionVersion: pvResult.Version
                })
            );
        } catch (err: any) {
            if (err.name === 'ResourceNotFoundException') {
                await lambdaClient.send(
                    new CreateAliasCommand({
                        FunctionName: pvResult.FunctionName,
                        Name: envs.LAMBDA_FUNCTION_ALIAS,
                        FunctionVersion: pvResult.Version
                    })
                );
            } else {
                throw err;
            }
        }
        let createProvisionedConcurrency = false;
        try {
            const gpcResult = await lambdaClient.send(
                new GetProvisionedConcurrencyConfigCommand({
                    FunctionName: pvResult.FunctionName,
                    Qualifier: envs.LAMBDA_FUNCTION_ALIAS
                })
            );
            if (gpcResult.AllocatedProvisionedConcurrentExecutions !== node.provisionedConcurrency) {
                createProvisionedConcurrency = true;
            }
        } catch (err: any) {
            if (err.name === 'ProvisionedConcurrencyConfigNotFoundException') {
                createProvisionedConcurrency = true;
            }
        }
        if (createProvisionedConcurrency) {
            await lambdaClient.send(
                new PutProvisionedConcurrencyConfigCommand({
                    FunctionName: pvResult.FunctionName,
                    Qualifier: envs.LAMBDA_FUNCTION_ALIAS,
                    ProvisionedConcurrentExecutions: node.provisionedConcurrency || envs.LAMBDA_PROVISIONED_CONCURRENCY
                })
            );
            await waitUntilProvisionedConcurrencyReady({
                functionName: pvResult.FunctionName || '',
                qualifier: envs.LAMBDA_FUNCTION_ALIAS,
                maxWaitTimeMs: 300000
            });
        }
        return Ok(undefined);
    }

    protected getEnvironmentVariables(node: Node): Environment {
        return {
            Variables: {
                NODE_ENV: envs.NODE_ENV,
                NANGO_CLOUD: String(envs.NANGO_CLOUD),
                RUNNER_NODE_ID: `${node.id}`,
                PERSIST_SERVICE_URL: envs.LAMBDA_PERSIST_SERVICE_URL || '',
                JOBS_SERVICE_URL: envs.LAMBDA_JOBS_SERVICE_URL || '',
                PROVIDERS_URL: envs.LAMBDA_PROVIDERS_URL || '',
                NANGO_TELEMETRY_SDK: String(envs.NANGO_TELEMETRY_SDK),
                DD_ENV: envs.DD_ENV || '',
                DD_SITE: envs.DD_SITE || '',
                DD_PROFILING_ENABLED: String(node.isProfilingEnabled),
                DD_APM_TRACING_ENABLED: String(node.isTracingEnabled),
                DD_TRACE_ENABLED: String(node.isTracingEnabled || node.isProfilingEnabled),
                DD_API_KEY_SECRET_ARN: envs.DD_API_KEY_SECRET_ARN || ''
            }
        };
    }

    async terminateFunction(node: Node): Promise<Result<void>> {
        const name = getFunctionName(node);
        const qualifer = getFunctionQualifier(node);
        await lambdaClient.send(
            new DeleteFunctionCommand({
                FunctionName: name,
                Qualifier: qualifer
            })
        );
        return Ok(undefined);
    }

    async verifyUrl(_url: string): Promise<Result<void>> {
        //this needs to be validates against a lambda function arn with qualifier using regex
        const regex = /^arn:aws:lambda:.*:function:nango-function-\d+-[a-f0-9-]+:.*$/;
        if (!regex.test(_url)) {
            return Err('Invalid URL');
        }
        return Promise.resolve(Ok(undefined));
    }
}

export const lambdaNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000,
        isTracingEnabled: false,
        isProfilingEnabled: false,
        idleMaxDurationMs: 0,
        executionTimeoutSecs: 900,
        provisionedConcurrency: 1
    },
    start: async (node: Node) => {
        return Lambda.getInstance().createFunction(node);
    },
    terminate: async (node: Node) => {
        return Lambda.getInstance().terminateFunction(node);
    },
    verifyUrl: async (url: string) => {
        return Lambda.getInstance().verifyUrl(url);
    },
    onFinishing: async (_node: Node) => {
        return Promise.resolve(Ok(undefined));
    }
};
