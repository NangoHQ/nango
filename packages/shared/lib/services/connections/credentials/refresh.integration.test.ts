import { beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';
import { logContextGetter, migrateLogsMapping } from '@nangohq/logs';
import { Ok, wait } from '@nangohq/utils';

import { refreshOrTestCredentials } from './refresh.js';
import { createConfigSeed, createConnectionSeed, seedAccountEnvAndUser } from '../../../seeders/index.js';
import encryptionManager from '../../../utils/encryption.manager';

describe('refreshOrTestCredentials', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await migrateLogsMapping();
    });

    it('should not refresh if unauthenticated', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'test', 'unauthenticated');
        const connection = await createConnectionSeed({ env, provider: 'unauthenticated' });
        const decryptedConnection = encryptionManager.decryptConnection(connection);
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

        const value = res.unwrap();

        expect(value).toEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date)
        });
        expect(value.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTest).not.toHaveBeenCalled();
    });

    it('should test if api key', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const integration = await createConfigSeed(env, 'test', 'algolia');
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

        const value = res.unwrap();

        expect(value).toEqual({
            ...decryptedConnection,
            last_fetched_at: expect.any(Date),
            last_refresh_success: expect.any(Date),
            credentials_expires_at: expect.any(Date),
            updated_at: expect.any(Date),
            credentials_iv: expect.any(String),
            credentials_tag: expect.any(String)
        });
        expect(value.last_fetched_at?.getTime()).toBeGreaterThan(decryptedConnection.last_fetched_at!.getTime());
        expect(value.credentials_expires_at?.getTime()).toBeGreaterThan(decryptedConnection.credentials_expires_at!.getTime());
        expect(value.last_refresh_success?.getTime()).toBeGreaterThan(decryptedConnection.last_refresh_success!.getTime());
        expect(value.updated_at?.getTime()).toBeGreaterThan(decryptedConnection.updated_at.getTime());
        expect(value.credentials_iv).not.toBe(decryptedConnection.credentials_iv);
        // @ts-expect-error yes it's okay
        expect(value.credentials['apiKey']).toBe(decryptedConnection.credentials['apiKey']);

        expect(onFailed).not.toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
        expect(onTest).toHaveBeenCalled();
    });
});
