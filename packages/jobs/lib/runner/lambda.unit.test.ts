import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertInternalTlsCompatibleWithLambda, lambdaNodeProvider } from './lambda.js';

import type { Node } from '@nangohq/fleet';

interface MockCommand {
    commandName: string;
    input: Record<string, unknown>;
}

const { sent } = vi.hoisted(() => ({
    sent: [] as MockCommand[]
}));

function mockCommands(names: string[]): Record<string, unknown> {
    return Object.fromEntries(
        names.map((name) => [
            name,
            class {
                input: Record<string, unknown>;
                readonly commandName = name;
                constructor(input: Record<string, unknown>) {
                    this.input = input;
                }
            }
        ])
    );
}

function mockClient() {
    return class {
        send(command: MockCommand) {
            sent.push(command);
            return Promise.resolve({ FunctionName: 'fn', Version: '1', AliasArn: 'arn:aws:lambda:us-west-2:1:function:fn:latest' });
        }
    };
}

vi.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: mockClient(),
    waitUntilFunctionActive: vi.fn(),
    waitUntilPublishedVersionActive: vi.fn(),
    ...mockCommands([
        'CreateAliasCommand',
        'CreateFunctionCommand',
        'DeleteFunctionCommand',
        'InvokeCommand',
        'PublishVersionCommand',
        'PutFunctionEventInvokeConfigCommand'
    ])
}));

vi.mock('@aws-sdk/client-cloudwatch-logs', () => ({
    CloudWatchLogsClient: mockClient(),
    ...mockCommands(['CreateLogGroupCommand', 'PutRetentionPolicyCommand'])
}));

vi.mock('@aws-sdk/client-application-auto-scaling', () => ({
    ApplicationAutoScalingClient: mockClient(),
    ...mockCommands(['DeleteScalingPolicyCommand', 'DeregisterScalableTargetCommand', 'PutScalingPolicyCommand', 'RegisterScalableTargetCommand'])
}));

vi.mock('../runtime/runtimes.js', () => ({
    registerWithFleet: vi.fn()
}));

vi.mock('../env.js', () => ({
    envs: {
        NODE_ENV: 'test',
        NANGO_CLOUD: true,
        NANGO_TELEMETRY_SDK: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: [],
        NANGO_OUTBOUND_URL_POLICY: null,
        DD_ENV: 'test',
        DD_SITE: 'datadoghq.com',
        DD_API_KEY_SECRET_ARN: 'arn:aws:secretsmanager:us-west-2:1:secret:dd',
        LAMBDA_ARCHITECTURE: 'arm64',
        LAMBDA_CREATE_TIMEOUT_SECS: 60,
        LAMBDA_DEFAULT_LOG_RETENTION_DAYS: 7,
        LAMBDA_ECR_REGISTRY: 'registry',
        LAMBDA_EXECUTION_ROLE_ARN: 'arn:aws:iam::1:role/runner',
        LAMBDA_EXECUTION_TIMEOUT_SECS: 900,
        LAMBDA_FUNCTION_ALIAS: 'latest',
        LAMBDA_JOBS_SERVICE_URL: 'https://jobs',
        LAMBDA_MAXIMUM_PROVISIONED_CONCURRENCY: 10,
        LAMBDA_MINIMUM_PROVISIONED_CONCURRENCY: 1,
        LAMBDA_PAYLOAD_MAX_SIZE_BYTES: 1048576,
        LAMBDA_PAYLOADS_BUCKET_NAME: 'payloads',
        LAMBDA_PERSIST_SERVICE_URL: 'https://persist',
        LAMBDA_PROVIDERS_URL: 'https://providers',
        LAMBDA_PROVISIONED_CONCURRENCY_SCALING_TARGET: 0.7,
        LAMBDA_SECURITY_GROUP_IDS: ['sg-1'],
        LAMBDA_SUBNET_IDS: ['subnet-1'],
        RUNNER_LAMBDA_FLEET_ID: 'nango_runners_lambda'
    }
}));

const node = {
    id: 1,
    routingId: 'default-M',
    image: 'runner:latest',
    memoryMb: 512,
    storageMb: 512,
    executionTimeoutSecs: 60,
    provisionedConcurrency: 1,
    isProfilingEnabled: false,
    isTracingEnabled: false
} as Node;

describe('assertInternalTlsCompatibleWithLambda', () => {
    it('should reject the combination', () => {
        expect(() => assertInternalTlsCompatibleWithLambda({ lambdaEnabled: true, tlsEnabled: true })).toThrow(/do not support internal mTLS/);
    });

    it('should allow either feature on its own', () => {
        expect(() => assertInternalTlsCompatibleWithLambda({ lambdaEnabled: true, tlsEnabled: false })).not.toThrow();
        expect(() => assertInternalTlsCompatibleWithLambda({ lambdaEnabled: false, tlsEnabled: true })).not.toThrow();
        expect(() => assertInternalTlsCompatibleWithLambda({ lambdaEnabled: false, tlsEnabled: false })).not.toThrow();
    });
});

describe('lambda function environment', () => {
    beforeEach(() => {
        sent.length = 0;
    });

    it('should never carry internal TLS assets', async () => {
        const res = await lambdaNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const created = await vi.waitFor(() => {
            const command = sent.find((call) => call.commandName === 'CreateFunctionCommand');
            if (!command) {
                throw new Error('CreateFunctionCommand was never sent');
            }
            return command;
        });

        const { Variables: variables } = created.input['Environment'] as { Variables: Record<string, string> };
        expect(Object.keys(variables).filter((key) => key.includes('TLS'))).toEqual([]);
        expect(JSON.stringify(variables)).not.toContain('BEGIN');
        expect(variables).not.toHaveProperty('NANGO_INTERNAL_AUTH_TOKEN');
        expect(variables).not.toHaveProperty('NANGO_INTERNAL_AUTH_SIGNING_KEY');
        expect(Object.keys(variables).filter((key) => key.startsWith('NANGO_INTERNAL_AUTH'))).toEqual([]);
    });
});
