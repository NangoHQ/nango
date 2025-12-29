import {
    CreateAliasCommand,
    CreateFunctionCommand,
    DeleteFunctionCommand,
    LambdaClient,
    PublishVersionCommand,
    PutProvisionedConcurrencyConfigCommand,
    waitUntilFunctionActive,
    waitUntilPublishedVersionActive
} from '@aws-sdk/client-lambda';

import { Err, Ok, getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { registerWithFleet } from '../runtime/runtimes.js';

import type { Environment } from '@aws-sdk/client-lambda';
import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

export const logger = getLogger('Lambda');

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
    //arn is made up 8 segments: arn:aws:lambda:region:account:function:functionName:qualifier
    const arnSegments = node.url?.split(':');
    return arnSegments && arnSegments.length >= 8 ? arnSegments[7]! : '';
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
        setImmediate(async () => {
            const name = getFunctionName(node);
            try {
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
                await lambdaClient.send(
                    new CreateAliasCommand({
                        FunctionName: pvResult.FunctionName,
                        Name: envs.LAMBDA_FUNCTION_ALIAS,
                        FunctionVersion: pvResult.Version
                    })
                );
                await lambdaClient.send(
                    new PutProvisionedConcurrencyConfigCommand({
                        FunctionName: pvResult.FunctionName,
                        Qualifier: envs.LAMBDA_FUNCTION_ALIAS,
                        ProvisionedConcurrentExecutions: node.provisionedConcurrency || envs.LAMBDA_PROVISIONED_CONCURRENCY
                    })
                );
                const fleetId = node.fleetId || envs.RUNNER_LAMBDA_FLEET_ID;
                const result = await registerWithFleet(fleetId, {
                    nodeId: node.id,
                    url: cfResult.FunctionArn!
                });
                if (result.isErr()) {
                    logger.error(`Error registering node ${node.id} to fleet ${fleetId}`, result.error);
                }
            } catch (err: any) {
                logger.error(`Error creating function ${name}`, err);
            }
        });
        return Promise.resolve(Ok(undefined));
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
        await lambdaClient.send(
            new DeleteFunctionCommand({
                FunctionName: name
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
    finish: async (_node: Node) => {
        return Promise.resolve(Ok(undefined));
    }
};
