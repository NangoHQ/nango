import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { getValidateConnectionFailureMessage, handleValidateConnectionFailure, validateConnection } from './validate-connection.js';

import type { LogContext } from '@nangohq/logs';
import type * as SharedModule from '@nangohq/shared';
import type { DBConnection, DBEnvironment, DBTeam, Provider } from '@nangohq/types';

const { mockHardDelete, mockMarkConnectionAuthFailed, mockReconnectionFailed, mockSearch, mockGetByConfig, mockInvoke, mockTriggerOnEventScript } = vi.hoisted(
    () => ({
        mockHardDelete: vi.fn(),
        mockMarkConnectionAuthFailed: vi.fn(),
        mockReconnectionFailed: vi.fn(),
        mockSearch: vi.fn(),
        mockGetByConfig: vi.fn(),
        mockInvoke: vi.fn(),
        mockTriggerOnEventScript: vi.fn()
    })
);

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');

    return {
        ...actual,
        connectionService: {
            hardDelete: mockHardDelete,
            markConnectionAuthFailed: mockMarkConnectionAuthFailed
        },
        functionConfigService: { search: mockSearch },
        onEventScriptService: { getByConfig: mockGetByConfig }
    };
});

vi.mock('../../hooks.js', () => ({
    reconnectionFailed: mockReconnectionFailed
}));

vi.mock('../../../utils/utils.js', () => ({
    getOrchestrator: () => ({ invokeFunction: mockInvoke, triggerOnEventScript: mockTriggerOnEventScript })
}));

const connection = { id: 42, connection_id: 'conn-1' } as DBConnection;
const config = { id: 1, unique_key: 'test', provider: 'attio', environment_id: 1 } as Parameters<typeof handleValidateConnectionFailure>[0]['config'];
const account = { id: 1, name: 'test' } as DBTeam;
const environment = { id: 1, name: 'dev' } as DBEnvironment;
const provider = { auth_mode: 'OAUTH2' } as Provider;
const logCtx = { id: 'log-1' } as unknown as LogContext;

describe('validateConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetByConfig.mockResolvedValue([]);
        mockSearch.mockResolvedValue(Ok([{ config: { id: 17, name: 'checkAccount' }, currentVersion: { limits: { concurrency: { perConnection: 1 } } } }]));
    });

    it('runs matching functions', async () => {
        mockInvoke.mockResolvedValue(Ok({ data: null }));
        const authLogCtx = { id: 'auth-log', failed: vi.fn() } as unknown as LogContext;
        const result = await validateConnection({ connection, config, account, environment, logCtx: authLogCtx });

        expect(result.unwrap()).toEqual({ tested: true });
        expect(mockSearch).toHaveBeenCalledWith(expect.anything(), {
            environmentId: environment.id,
            filter: { integrationKey: config.unique_key, enabled: true, trigger: { kind: 'event', event: 'validate-connection' } }
        });
        expect(mockInvoke).toHaveBeenCalledWith(
            expect.objectContaining({
                functionConfigId: 17,
                functionName: 'checkAccount',
                trigger: {
                    kind: 'event',
                    input: { event: 'validate-connection' },
                    connection: { connectionId: connection.connection_id, integrationId: config.unique_key }
                },
                async: false,
                maxConcurrency: 1,
                logCtx: authLogCtx
            })
        );
        expect(mockGetByConfig).not.toHaveBeenCalled();
    });

    it('runs legacy when no function', async () => {
        mockSearch.mockResolvedValue(Ok([]));
        mockGetByConfig.mockResolvedValue([{ id: 18, name: 'legacyCheck', file_location: 'legacy.js', version: '1', sdk_version: '1' }]);
        mockTriggerOnEventScript.mockResolvedValue(Ok({ data: null }));

        const result = await validateConnection({ connection, config, account, environment, logCtx });

        expect(result.unwrap()).toEqual({ tested: true });
        expect(mockTriggerOnEventScript).toHaveBeenCalledOnce();
        expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('rejects validation when the function fails', async () => {
        const error = new NangoError('function_failure', { error: 'Invalid account' });
        mockInvoke.mockResolvedValue(Err(error));
        const authLogCtx = { id: 'auth-log', failed: vi.fn() } as unknown as LogContext;
        const result = await validateConnection({ connection, config, account, environment, logCtx: authLogCtx });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(error);
        }
        expect(authLogCtx.failed).toHaveBeenCalledOnce();
        expect(mockGetByConfig).not.toHaveBeenCalled();
    });

    it('propagates function lookup failures without treating them as validation failures', async () => {
        const error = new Error('failed_to_find_function');
        mockSearch.mockResolvedValue(Err(error));

        await expect(validateConnection({ connection, config, account, environment, logCtx })).rejects.toBe(error);
        expect(mockGetByConfig).not.toHaveBeenCalled();
        expect(mockInvoke).not.toHaveBeenCalled();
    });
});

describe('getValidateConnectionFailureMessage', () => {
    it('returns payload message when present', () => {
        const error = new NangoError('on_event_script_failure', { message: 'Workspace mismatch' });
        expect(getValidateConnectionFailureMessage(error)).toBe('Workspace mismatch');
    });

    it('returns payload error when message is absent', () => {
        const error = new NangoError('on_event_script_failure', { error: 'Script failed' });
        expect(getValidateConnectionFailureMessage(error)).toBe('Script failed');
    });

    it('returns default message when payload has neither', () => {
        const error = new NangoError('on_event_script_failure', {});
        expect(getValidateConnectionFailureMessage(error)).toBe('Connection failed validation');
    });
});

describe('handleValidateConnectionFailure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hard deletes on creation', async () => {
        const error = new NangoError('on_event_script_failure', { message: 'Invalid' });

        const message = await handleValidateConnectionFailure({
            operation: 'creation',
            connection,
            config,
            account,
            environment,
            provider,
            error,
            logCtx
        });

        expect(message).toBe('Invalid');
        expect(mockHardDelete).toHaveBeenCalledWith(42);
        expect(mockMarkConnectionAuthFailed).not.toHaveBeenCalled();
        expect(mockReconnectionFailed).not.toHaveBeenCalled();
    });

    it('marks auth failed on override', async () => {
        const error = new NangoError('on_event_script_failure', { message: 'Workspace mismatch' });

        const message = await handleValidateConnectionFailure({
            operation: 'override',
            connection,
            config,
            account,
            environment,
            provider,
            error,
            logCtx
        });

        expect(message).toBe('Workspace mismatch');
        expect(mockHardDelete).not.toHaveBeenCalled();
        expect(mockMarkConnectionAuthFailed).toHaveBeenCalledWith({ id: 42 });
        expect(mockReconnectionFailed).toHaveBeenCalledWith({
            account,
            connection,
            environment,
            provider,
            config,
            authError: { type: 'connection_validation_failed', description: 'Workspace mismatch' },
            logCtx
        });
    });
});
