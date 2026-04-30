// Unit tests for LambdaRuntimeAdapter – large payload S3 upload behaviour

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

const { mockS3Send, mockLambdaSend, mockEnvs } = vi.hoisted(() => ({
    mockS3Send: vi.fn(),
    mockLambdaSend: vi.fn(),
    mockEnvs: {
        LAMBDA_PAYLOADS_BUCKET_NAME: 'test-payloads-bucket',
        LAMBDA_PAYLOAD_MAX_SIZE_BYTES: 100
    }
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
    HeadObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, constructor: { name: 'HeadObjectCommand' } })),
    PutObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, constructor: { name: 'PutObjectCommand' } }))
}));

vi.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: vi.fn().mockImplementation(() => ({ send: mockLambdaSend })),
    InvokeCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, constructor: { name: 'InvokeCommand' } }))
}));

vi.mock('../env.js', () => ({
    get envs() {
        return mockEnvs;
    }
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        getLogger: vi.fn(() => ({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn()
        }))
    };
});

import { LambdaRuntimeAdapter } from './lambda.adapter.js';

import type { FunctionSource } from '@nangohq/types';

function minimalNangoProps(overrides: { environmentId?: number } = {}) {
    return {
        logger: { level: 'info' as const },
        scriptType: 'sync' as const,
        connectionId: 'conn-1',
        nangoConnectionId: 1,
        environmentId: overrides.environmentId ?? 1,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        syncId: 'sync-1',
        syncConfig: {
            id: 1,
            sync_name: 'test-sync',
            type: 'sync' as const,
            environment_id: 1,
            models: [],
            file_location: '/tmp',
            nango_config_id: 1,
            active: true,
            runs: null,
            track_deletes: false,
            auto_start: false,
            enabled: true,
            webhook_subscriptions: [],
            model_schema: null,
            models_json_schema: {},
            created_at: new Date(),
            updated_at: new Date(),
            version: '1',
            attributes: {},
            source: 'repo' as FunctionSource,
            input: null,
            sync_type: null,
            metadata: {},
            sdk_version: null,
            features: []
        },
        activityLogId: 'log-1',
        secretKey: 'sk',
        debug: false,
        startedAt: new Date(),
        endUser: null,
        runnerFlags: {
            validateActionInput: false,
            validateActionOutput: false,
            validateWebhookInput: false,
            validateWebhookOutput: false,
            validateSyncRecords: false,
            validateSyncMetadata: false
        }
    };
}

describe('LambdaRuntimeAdapter – large payload S3 upload', () => {
    const mockFleet = {
        getRunningNode: vi.fn().mockResolvedValue(Ok({ id: 'node-1', url: 'arn:aws:lambda:us-east-1:123456789:function:test-fn:latest' }))
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFleet.getRunningNode.mockResolvedValue(Ok({ id: 'node-1', url: 'arn:aws:lambda:us-east-1:123456789:function:test-fn:latest' }));

        // S3: HeadObject fails (so uploadCode does Put), PutObject succeeds
        mockS3Send.mockImplementation((cmd: { constructor?: { name: string } }) => {
            if (cmd.constructor?.name === 'HeadObjectCommand') {
                return Promise.reject(new Error('NotFound'));
            }
            return Promise.resolve({ VersionId: undefined, ETag: '"etag-123"' });
        });

        mockLambdaSend.mockResolvedValue(undefined);
    });

    it('when payload exceeds max size and bucket is set, uploads code and codeParams to S3 and sends payload with codeRef/codeParamsRef', async () => {
        const code = 'export default async function run() { return "hello"; }';
        const codeParams = { foo: 'bar', large: 'x'.repeat(200) };
        const nangoProps = minimalNangoProps({ environmentId: 42 });
        const taskId = 'task-abc-123';

        const adapter = new LambdaRuntimeAdapter(mockFleet as any);
        const result = await adapter.invoke({ taskId, nangoProps, code, codeParams });

        expect(result.isOk()).toBe(true);

        // S3 PutObjectCommand should be called: once for code, once for codeParams
        expect(mockS3Send).toHaveBeenCalledTimes(3); // 1 HeadObject (code) + 2 PutObject (code, codeParams)
        const putCalls = mockS3Send.mock.calls.filter(
            (args: unknown[]) => (args[0] as { constructor?: { name: string } }).constructor?.name === 'PutObjectCommand'
        );
        expect(putCalls.length).toBe(2);

        // Lambda InvokeCommand should be called with payload containing codeRef and codeParamsRef (no inline code/codeParams)
        expect(mockLambdaSend).toHaveBeenCalledTimes(1);
        const invokeCommand = (mockLambdaSend.mock.calls[0]! as unknown[])[0] as { input?: { Payload?: string } };
        const invokePayload = invokeCommand?.input?.Payload;
        expect(typeof invokePayload).toBe('string');
        const payload = JSON.parse(invokePayload as string);
        expect(payload).toHaveProperty('codeRef');
        expect(payload).toHaveProperty('codeParamsRef');
        expect(payload.codeRef).toMatchObject({ kind: 's3', bucket: 'test-payloads-bucket', key: expect.stringContaining('environments/42/function-code/') });
        expect(payload.codeParamsRef).toMatchObject({
            kind: 's3',
            bucket: 'test-payloads-bucket',
            key: expect.stringContaining('environments/42/function-params/task-abc-123/')
        });
        expect(payload).not.toHaveProperty('code');
        expect(payload).not.toHaveProperty('codeParams');
    });

    it('when payload is under max size, does not call S3 and sends inline code and codeParams', async () => {
        mockEnvs.LAMBDA_PAYLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB so our small payload is under
        const code = 'export default async function run() {}';
        const codeParams = { foo: 'bar' };
        const nangoProps = minimalNangoProps();
        const taskId = 'task-small';

        const adapter = new LambdaRuntimeAdapter(mockFleet as any);
        const result = await adapter.invoke({ taskId, nangoProps, code, codeParams });

        expect(result.isOk()).toBe(true);
        expect(mockS3Send).not.toHaveBeenCalled();

        const invokeCommand = (mockLambdaSend.mock.calls[0]! as unknown[])[0] as { input?: { Payload?: string } };
        const invokePayload = invokeCommand?.input?.Payload;
        const payload = JSON.parse(invokePayload as string);
        expect(payload).toHaveProperty('code', code);
        expect(payload).toHaveProperty('codeParams', codeParams);
        expect(payload).not.toHaveProperty('codeRef');
        expect(payload).not.toHaveProperty('codeParamsRef');

        mockEnvs.LAMBDA_PAYLOAD_MAX_SIZE_BYTES = 100;
    });

    it('when payload exceeds max size but bucket is not set, sends inline payload (no S3 upload)', async () => {
        const originalBucket = mockEnvs.LAMBDA_PAYLOADS_BUCKET_NAME;
        mockEnvs.LAMBDA_PAYLOADS_BUCKET_NAME = '';

        const code = 'x'.repeat(200);
        const codeParams = { large: 'y'.repeat(200) };
        const nangoProps = minimalNangoProps();
        const taskId = 'task-no-bucket';

        const adapter = new LambdaRuntimeAdapter(mockFleet as any);
        const result = await adapter.invoke({ taskId, nangoProps, code, codeParams });

        expect(result.isOk()).toBe(true);
        expect(mockS3Send).not.toHaveBeenCalled();

        const invokeCommand = (mockLambdaSend.mock.calls[0]! as unknown[])[0] as { input?: { Payload?: string } };
        const invokePayload = invokeCommand?.input?.Payload;
        const payload = JSON.parse(invokePayload as string);
        expect(payload).toHaveProperty('code');
        expect(payload).toHaveProperty('codeParams');
        expect(payload).not.toHaveProperty('codeRef');
        expect(payload).not.toHaveProperty('codeParamsRef');

        mockEnvs.LAMBDA_PAYLOADS_BUCKET_NAME = originalBucket;
    });
});
