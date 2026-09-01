import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    exportRunnerPublicKey,
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    verifyInternalServiceToken,
    verifyRunnerDispatchToken
} from '@nangohq/internal-auth';
import { Ok } from '@nangohq/utils';

import { RunnerRuntimeAdapter } from './runner.adapter.js';

import type { NangoProps } from '@nangohq/types';

const { getRunnerMock, getRunnersMock, mockEnvs } = vi.hoisted(() => ({
    getRunnerMock: vi.fn(),
    getRunnersMock: vi.fn(),
    mockEnvs: {
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false
    }
}));

vi.mock('../env.js', () => ({
    envs: mockEnvs
}));

vi.mock('../runner/runner.js', () => ({
    getRunner: getRunnerMock,
    getRunners: getRunnersMock
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

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

function minimalNangoProps(): NangoProps {
    return {
        logger: { level: 'info' },
        scriptType: 'sync',
        connectionId: 'conn-1',
        nangoConnectionId: 1,
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        syncId: 'sync-1',
        syncConfig: {
            id: 1,
            sync_name: 'test-sync',
            type: 'sync',
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
            source: 'repo',
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
            validateSyncMetadata: false,
            exportRunnerTelemetry: false
        }
    } as NangoProps;
}

describe('RunnerRuntimeAdapter internal auth', () => {
    const startMutate = vi.fn().mockResolvedValue(true);
    beforeEach(() => {
        vi.clearAllMocks();
        startMutate.mockResolvedValue(true);
        getRunnerMock.mockResolvedValue(Ok({ url: 'http://runner', client: { start: { mutate: startMutate } } }));
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    });

    afterEach(() => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    });

    it('omits internalAuthToken when the signing key is unset', async () => {
        const adapter = new RunnerRuntimeAdapter();
        const result = await adapter.invoke({ taskId: 'task-1', nangoProps: minimalNangoProps(), code: 'code', codeParams: {} });
        expect(result.isOk()).toBe(true);
        expect(startMutate).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: 'task-1',
                code: 'code'
            })
        );
        expect(startMutate.mock.calls[0]?.[0]).not.toHaveProperty('internalAuthToken');
    });

    it('passes internalAuthToken on start when the signing key is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const adapter = new RunnerRuntimeAdapter();
        const result = await adapter.invoke({ taskId: 'task-1', nangoProps: minimalNangoProps(), code: 'code', codeParams: {} });
        expect(result.isOk()).toBe(true);
        const internalAuthToken = startMutate.mock.calls[0]?.[0].internalAuthToken as string;
        expect(internalAuthToken).toEqual(expect.stringMatching(/^eyJ/));
        expect(verifyInternalServiceToken(internalAuthToken, INTERNAL_SERVICE_AUDIENCE_JOBS, 'sign')).toMatchObject({
            op: 'task',
            taskId: 'task-1',
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS
        });
        expect(getRunnerMock).toHaveBeenCalledWith(1, expect.objectContaining({ token: expect.stringMatching(/^eyJ/) }));
        const dispatchToken = getRunnerMock.mock.calls[0]?.[1]?.token as string;
        expect(verifyRunnerDispatchToken(dispatchToken, INTERNAL_SERVICE_AUDIENCE_RUNNER, exportRunnerPublicKey('sign'))).toMatchObject({
            op: 'task',
            taskId: 'task-1',
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER
        });
    });

    it('passes a runner-audience token to getRunners on cancel when the signing key is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const abortMutate = vi.fn().mockResolvedValue(true);
        getRunnersMock.mockResolvedValue(Ok([{ client: { abort: { mutate: abortMutate } } }]));
        const adapter = new RunnerRuntimeAdapter();
        const result = await adapter.cancel({ taskId: 'task-1', nangoProps: minimalNangoProps() });
        expect(result.isOk()).toBe(true);
        expect(getRunnersMock).toHaveBeenCalledWith(1, expect.objectContaining({ token: expect.stringMatching(/^eyJ/) }));
        const dispatchToken = getRunnersMock.mock.calls[0]?.[1]?.token as string;
        expect(verifyRunnerDispatchToken(dispatchToken, INTERNAL_SERVICE_AUDIENCE_RUNNER, exportRunnerPublicKey('sign'))).toMatchObject({
            op: 'task',
            taskId: 'task-1'
        });
    });
});
