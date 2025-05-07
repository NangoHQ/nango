import { beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';
import { logContextGetter, migrateLogsMapping } from '@nangohq/logs';
import { Err, Ok, wait } from '@nangohq/utils';

import { refreshOrTestCredentials } from './refresh.js';
import { createConfigSeed, createConnectionSeed, seedAccountEnvAndUser } from '../../../seeders/index.js';
import encryptionManager from '../../../utils/encryption.manager';
import { NangoError } from '../../../utils/error.js';
import connectionService from '../../connection.service.js';

describe('refreshOrTestCredentials', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateLogsMapping();
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
        expect(value.credentials['apiKey']).toBe(decryptedConnection.credentials['apiKey']);

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
        expect(value.credentials['apiKey']).toBe(decryptedConnection.credentials['apiKey']);

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
});
