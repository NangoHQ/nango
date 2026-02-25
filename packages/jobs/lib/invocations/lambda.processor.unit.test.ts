// Unit tests for LambdaInvocationsProcessor

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListen = vi.fn();
vi.mock('../events/sqs.listener.js', () => ({
    SqsEventListener: vi.fn().mockImplementation(() => ({
        listen: mockListen
    }))
}));

vi.mock('../execution/operations/handler.js', () => ({
    handleError: vi.fn().mockResolvedValue(undefined)
}));

let mockLambdaFailureDestination: string | undefined = 'https://sqs.us-west-2.amazonaws.com/123456789/lambda-failures';
vi.mock('../env.js', () => ({
    get envs() {
        return { LAMBDA_FAILURE_DESTINATION: mockLambdaFailureDestination };
    }
}));

import { LambdaInvocationsProcessor } from './lambda.processor.js';
import { handleError } from '../execution/operations/handler.js';

function minimalNangoProps() {
    return {
        scriptType: 'action' as const,
        connectionId: 'conn-1',
        nangoConnectionId: 1,
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        syncConfig: {
            id: 1,
            sync_name: 'test-sync',
            type: 'action' as const,
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
            pre_built: false,
            is_public: false,
            input: null,
            sync_type: null,
            metadata: {},
            sdk_version: null
        },
        activityLogId: 'aaaaaaaaaaaaaaaaaaaa',
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

function failureMessage(
    overrides: {
        functionError?: string;
        statusCode?: number;
        errorMessage?: string;
        taskId?: string;
        nangoProps?: ReturnType<typeof minimalNangoProps>;
    } = {}
) {
    const {
        functionError = 'Unhandled',
        statusCode = 500,
        errorMessage = 'Something went wrong',
        taskId = 'task-123',
        nangoProps = minimalNangoProps()
    } = overrides;
    const payload = {
        responseContext: { functionError, statusCode },
        responsePayload: { errorMessage },
        requestPayload: { taskId, nangoProps }
    };
    return {
        body: JSON.stringify(payload)
    };
}

describe('LambdaInvocationsProcessor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call listen with LAMBDA_FAILURE_DESTINATION when start() is called', async () => {
        const processor = new LambdaInvocationsProcessor();
        await processor.start();
        expect(mockListen).toHaveBeenCalledTimes(1);
        expect(mockListen).toHaveBeenCalledWith('https://sqs.us-west-2.amazonaws.com/123456789/lambda-failures', expect.any(Function));
    });

    it('should process Unhandled failure and call handleError with function_runtime_other for generic error message', async () => {
        let onMessage: (message: { body: string }) => Promise<void> = undefined!;
        mockListen.mockImplementation((_queue: string, cb: (m: { body: string }) => Promise<void>) => {
            onMessage = cb;
        });

        const processor = new LambdaInvocationsProcessor();
        await processor.start();
        expect(onMessage).toBeDefined();

        const message = failureMessage({ errorMessage: 'Random error' });
        await onMessage(message);

        expect(handleError).toHaveBeenCalledTimes(1);
        expect(handleError).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: 'task-123',
                error: expect.objectContaining({
                    type: 'function_runtime_other',
                    payload: { errorMessage: 'Random error' },
                    status: 500
                }),
                telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 0 },
                functionRuntime: 'lambda'
            })
        );
    });

    it('should map "signal: killed" error message to function_runtime_out_of_memory', async () => {
        let onMessage: (message: { body: string }) => Promise<void> = undefined!;
        mockListen.mockImplementation((_queue: string, cb: (m: { body: string }) => Promise<void>) => {
            onMessage = cb;
        });

        const processor = new LambdaInvocationsProcessor();
        await processor.start();

        await onMessage(failureMessage({ errorMessage: 'Process exited with signal: killed' }));

        expect(handleError).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    type: 'function_runtime_out_of_memory',
                    payload: { errorMessage: 'Process exited with signal: killed' }
                })
            })
        );
    });

    it('should map "Task timed out" error message to function_runtime_timed_out', async () => {
        let onMessage: (message: { body: string }) => Promise<void> = undefined!;
        mockListen.mockImplementation((_queue: string, cb: (m: { body: string }) => Promise<void>) => {
            onMessage = cb;
        });

        const processor = new LambdaInvocationsProcessor();
        await processor.start();

        await onMessage(failureMessage({ errorMessage: 'Task timed out after 30.00 seconds' }));

        expect(handleError).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    type: 'function_runtime_timed_out',
                    payload: { errorMessage: 'Task timed out after 30.00 seconds' }
                })
            })
        );
    });

    it('should not call handleError when functionError is not Unhandled', async () => {
        let onMessage: (message: { body: string }) => Promise<void> = undefined!;
        mockListen.mockImplementation((_queue: string, cb: (m: { body: string }) => Promise<void>) => {
            onMessage = cb;
        });

        const processor = new LambdaInvocationsProcessor();
        await processor.start();

        await onMessage(failureMessage({ functionError: 'Handled', statusCode: 400, errorMessage: 'Validation failed', taskId: 'task-456' }));

        expect(handleError).not.toHaveBeenCalled();
    });

    it('should not call listen when LAMBDA_FAILURE_DESTINATION is not set', async () => {
        const url = mockLambdaFailureDestination;
        mockLambdaFailureDestination = undefined;
        vi.resetModules();
        const { LambdaInvocationsProcessor: Processor } = await import('./lambda.processor.js');
        const processor = new Processor();
        await processor.start();
        expect(mockListen).not.toHaveBeenCalled();
        mockLambdaFailureDestination = url;
    });
});
