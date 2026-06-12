import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NangoError } from '@nangohq/shared';

import { getValidateConnectionFailureMessage, handleValidateConnectionFailure } from './validate-connection.js';

import type { LogContext } from '@nangohq/logs';
import type * as SharedModule from '@nangohq/shared';
import type { DBConnection, DBEnvironment, DBTeam, Provider } from '@nangohq/types';

const { mockHardDelete, mockMarkConnectionAuthFailed, mockReconnectionFailed } = vi.hoisted(() => ({
    mockHardDelete: vi.fn(),
    mockMarkConnectionAuthFailed: vi.fn(),
    mockReconnectionFailed: vi.fn()
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');

    return {
        ...actual,
        connectionService: {
            hardDelete: mockHardDelete,
            markConnectionAuthFailed: mockMarkConnectionAuthFailed
        }
    };
});

vi.mock('../../hooks.js', () => ({
    reconnectionFailed: mockReconnectionFailed
}));

vi.mock('../../../utils/utils.js', () => ({
    getOrchestrator: vi.fn()
}));

const connection = { id: 42, connection_id: 'conn-1' } as DBConnection;
const config = { id: 1, unique_key: 'test', provider: 'attio', environment_id: 1 } as Parameters<typeof handleValidateConnectionFailure>[0]['config'];
const account = { id: 1, name: 'test' } as DBTeam;
const environment = { id: 1, name: 'dev' } as DBEnvironment;
const provider = { auth_mode: 'OAUTH2' } as Provider;
const logCtx = { id: 'log-1' } as unknown as LogContext;

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
        expect(mockReconnectionFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                error: { type: 'connection_validation_failed', description: 'Workspace mismatch' },
                operation: 'override'
            }),
            account,
            logCtx,
            config
        );
    });
});
