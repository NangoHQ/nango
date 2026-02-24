import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';
import { logContextGetter, migrateLogsMapping } from '@nangohq/logs';
import { Err, Ok, wait } from '@nangohq/utils';

import { refreshOrTestCredentials } from './refresh.js';
import { createConfigSeed, createConnectionSeed, seedAccountEnvAndUser } from '../../../seeders/index.js';
import encryptionManager from '../../../utils/encryption.manager.js';
import { NangoError } from '../../../utils/error.js';
import connectionService from '../../connection.service.js';
import { REFRESH_FAILURE_COOLDOWN_MS } from '../utils.js';

describe('refreshOrTestCredentials', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateLogsMapping();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should not refresh if unauthenticated', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'unauthenticated', 'unauthenticated');
        const connection = await createConnectionSeed({ env, provider: 'unauthenticated' });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        // wait just to make sure all timestamps are different
        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn();
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        const refreshed = res.unwrap();

        // Nothing should have changed except last_fetched
        expect(refreshed).toEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date)
        });
        expect(refreshed.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTest).not.toHaveBeenCalled();
    });

    it('should test if api key and succeed', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn(() => Promise.resolve(Ok({ tested: true }))) as any;
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        const refreshed = res.unwrap();

        // Make sure all relevant fields are updated
        expect(refreshed).toStrictEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date),
            last_refresh_success: expect.any(Date),
            credentials_expires_at: expect.any(Date),
            updated_at: expect.any(Date),
            credentials_iv: expect.any(String),
            credentials_tag: expect.any(String)
        });
        expect(refreshed.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(refreshed.credentials_expires_at?.getTime()).toBeGreaterThan(decryptedConnection.credentials_expires_at!.getTime());
        expect(refreshed.last_refresh_success?.getTime()).toBeGreaterThan(decryptedConnection.last_refresh_success!.getTime());
        expect(refreshed.updated_at?.getTime()).toBeGreaterThan(decryptedConnection.updated_at.getTime());
        expect(refreshed.credentials_iv).not.toBe(decryptedConnection.credentials_iv);
        // @ts-expect-error yes it's okay
        expect(refreshed.credentials['apiKey']).toBe(decryptedConnection.credentials['apiKey']);

        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
        expect(onTest).toHaveBeenCalled();

        // Make sure we correctly reflected the update in the DB
        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedUpdatedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedUpdatedConnection) {
            throw new Error('Failed to decrypt updated connection');
        }
        expect(refreshed).toStrictEqual(decryptedUpdatedConnection);
    });

    it('should test if api key and fail', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn(() => Promise.resolve(Err(new NangoError('test')))) as any;
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        if (res.isOk()) {
            throw new Error('should not succeed');
        }

        expect(onFailed).toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTest).toHaveBeenCalled();

        // Make sure we correctly reflected the update in the DB
        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedUpdatedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedUpdatedConnection) {
            throw new Error('Failed to decrypt updated connection');
        }
        expect(decryptedUpdatedConnection).toStrictEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date),
            last_refresh_success: null,
            last_refresh_failure: expect.any(Date),
            updated_at: expect.any(Date),
            refresh_attempts: 1
        });
        expect(decryptedUpdatedConnection.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(decryptedUpdatedConnection.updated_at?.getTime()).toBeGreaterThan(decryptedConnection.updated_at.getTime());
    });

    it('should refresh if oauth2 and succeed (fake token)', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'airtable', 'airtable');
        const connection = await createConnectionSeed({
            env,
            provider: 'airtable',
            rawCredentials: { type: 'OAUTH2', access_token: 'foobar', refresh_token: 'barfoo', expires_at: new Date(Date.now() - 1000), raw: {} }
        });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const spy = vi.spyOn(connectionService, 'getNewCredentials').mockImplementation(() => {
            return Promise.resolve({
                success: true,
                error: null,
                response: { type: 'OAUTH2', access_token: 'new1', refresh_token: 'new2', expires_at: new Date(Date.now() + 1000), raw: {} }
            });
        });
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            logContextGetter: logContextGetter
        });

        const refreshed = res.unwrap();

        // Make sure all relevant fields are updated
        expect(refreshed).toStrictEqual<typeof refreshed>({
            ...decryptedConnection,
            credentials: {
                type: 'OAUTH2',
                access_token: 'new1',
                refresh_token: 'new2',
                // @ts-expect-error todo: fix this type
                expires_at: expect.toBeIsoDate(),
                raw: {}
            },
            last_fetched_at: expect.any(Date),
            last_refresh_success: expect.any(Date),
            credentials_expires_at: expect.any(Date),
            updated_at: expect.any(Date),
            credentials_iv: expect.any(String),
            credentials_tag: expect.any(String)
        });
        expect(refreshed.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(refreshed.credentials_expires_at?.getTime()).toBeGreaterThan(decryptedConnection.credentials_expires_at!.getTime());
        expect(refreshed.last_refresh_success?.getTime()).toBeGreaterThan(decryptedConnection.last_refresh_success!.getTime());
        expect(refreshed.updated_at?.getTime()).toBeGreaterThan(decryptedConnection.updated_at.getTime());
        expect(refreshed.credentials_iv).not.toBe(decryptedConnection.credentials_iv);
        // @ts-expect-error yes it's okay
        expect(refreshed.credentials['apiKey']).toBe(decryptedConnection.credentials['apiKey']);

        expect(onFailed).not.toHaveBeenCalledOnce();
        expect(onSuccess).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledOnce();

        // Make sure we correctly reflected the update in the DB
        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedUpdatedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedUpdatedConnection) {
            throw new Error('Failed to decrypt updated connection');
        }
        expect(refreshed).toStrictEqual(decryptedUpdatedConnection);
    });

    it('should refresh if oauth2 and fail (wrong token)', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'test', 'airtable');
        const connection = await createConnectionSeed({
            env,
            provider: 'airtable',
            rawCredentials: { type: 'OAUTH2', access_token: 'foobar', refresh_token: 'barfoo', raw: {} }
        });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            logContextGetter: logContextGetter
        });

        if (res.isOk()) {
            throw new Error('should not succeed');
        }

        expect(onFailed).toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();

        // Make sure we correctly reflected the update in the DB
        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedUpdatedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedUpdatedConnection) {
            throw new Error('Failed to decrypt updated connection');
        }
        expect(decryptedUpdatedConnection).toStrictEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date),
            last_refresh_success: null,
            last_refresh_failure: expect.any(Date),
            updated_at: expect.any(Date),
            refresh_attempts: 1
        });
        expect(decryptedUpdatedConnection.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(decryptedUpdatedConnection.updated_at?.getTime()).toBeGreaterThan(decryptedConnection.updated_at.getTime());
    });

    it('should return early with connection_refresh_exhausted if refresh_exhausted is set', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        // upsertConnection always resets refresh_exhausted, so set it explicitly after creation
        const exhaustedConnection = await connectionService.updateConnection({ ...decryptedConnection, refresh_exhausted: true });

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn();
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: exhaustedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.type).toBe('connection_refresh_exhausted');
        }

        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTest).not.toHaveBeenCalled();
    });

    it('should return early if refresh failed within the cooldown window (non-instant refresh)', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });

        // Simulate a recent refresh failure (just now, well within the cooldown window)
        await connectionService.setRefreshFailure({ id: connection.id, lastRefreshFailure: null, currentAttempt: 0 });

        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn();
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.type).toBe('connection_refresh_backoff');
        }

        // Hooks should NOT be called, we returned early before attempting the refresh
        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTest).not.toHaveBeenCalled();
    });

    it('should NOT return early within the cooldown window when instantRefresh is true', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });

        // Simulate a recent refresh failure (just now, well within the cooldown window)
        await connectionService.setRefreshFailure({ id: connection.id, lastRefreshFailure: null, currentAttempt: 0 });

        const updatedConnection = await connectionService.getConnectionById(connection.id);
        const decryptedConnection = encryptionManager.decryptConnection(updatedConnection!);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        await wait(2);
        const onFailed = vi.fn();
        const onSuccess = vi.fn();
        const onTest = vi.fn(() => Promise.resolve(Err(new NangoError('test')))) as any;
        const res = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: true,
            connection: decryptedConnection,
            onRefreshFailed: onFailed,
            onRefreshSuccess: onSuccess,
            connectionTestHook: onTest,
            logContextGetter: logContextGetter
        });

        // Should have attempted the refresh (and failed via test hook), not returned early
        expect(res.isErr()).toBe(true);
        expect(onFailed).toHaveBeenCalled();
        expect(onTest).toHaveBeenCalled();
    });

    it('should backoff within cooldown window and retry after cooldown expires', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'algolia', 'algolia');
        const connection = await createConnectionSeed({ env, provider: 'algolia', rawCredentials: { type: 'API_KEY', apiKey: 'foobar' } });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
        if (!decryptedConnection) {
            throw new Error('Failed to decrypt connection');
        }

        vi.useFakeTimers();
        const start = new Date('2025-01-01T00:00:00Z');
        vi.setSystemTime(start);

        // First call: refresh fails, sets last_refresh_failure
        const res1 = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: decryptedConnection,
            onRefreshFailed: vi.fn(),
            onRefreshSuccess: vi.fn(),
            connectionTestHook: vi.fn(() => Promise.resolve(Err(new NangoError('test')))) as any,
            logContextGetter
        });
        expect(res1.isErr()).toBe(true);

        // Second call: 10 seconds later, still within cooldown window
        vi.setSystemTime(new Date(start.getTime() + 10_000));
        const connectionAfterFailure = encryptionManager.decryptConnection((await connectionService.getConnectionById(connection.id))!);
        if (!connectionAfterFailure) {
            throw new Error('Failed to decrypt connection');
        }
        const onTest2 = vi.fn();
        const onFailed2 = vi.fn();
        const res2 = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: connectionAfterFailure,
            onRefreshFailed: onFailed2,
            onRefreshSuccess: vi.fn(),
            connectionTestHook: onTest2,
            logContextGetter
        });
        expect(res2.isErr()).toBe(true);
        if (res2.isErr()) {
            expect(res2.error.type).toBe('connection_refresh_backoff');
        }
        expect(onTest2).not.toHaveBeenCalled();
        expect(onFailed2).not.toHaveBeenCalled();

        // Third call: after cooldown expires, refresh is attempted and succeeds
        vi.setSystemTime(new Date(start.getTime() + REFRESH_FAILURE_COOLDOWN_MS + 1000));
        const connectionAfterCooldown = encryptionManager.decryptConnection((await connectionService.getConnectionById(connection.id))!);
        if (!connectionAfterCooldown) {
            throw new Error('Failed to decrypt connection');
        }
        const onTest3 = vi.fn(() => Promise.resolve(Ok({ tested: true }))) as any;
        const onSuccess3 = vi.fn();
        const res3 = await refreshOrTestCredentials({
            account,
            environment: env,
            integration,
            instantRefresh: false,
            connection: connectionAfterCooldown,
            onRefreshFailed: vi.fn(),
            onRefreshSuccess: onSuccess3,
            connectionTestHook: onTest3,
            logContextGetter
        });
        expect(res3.isOk()).toBe(true);
        expect(onTest3).toHaveBeenCalled();
        expect(onSuccess3).toHaveBeenCalled();
    });
});
