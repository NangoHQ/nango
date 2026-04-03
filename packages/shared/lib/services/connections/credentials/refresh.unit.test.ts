import { afterEach, describe, expect, it, vi } from 'vitest';

import * as kvstoreModule from '@nangohq/kvstore';
import { LockTimeoutError } from '@nangohq/kvstore';

import { refreshCredentialsIfNeeded, shouldRefreshCredentials } from './refresh.js';
import { getTestConnection } from '../../../seeders/connection.seeder.js';
import connectionService from '../../connection.service.js';
import { REFRESH_MARGIN_MS } from '../utils.js';

import type { Config } from '../../../models/index.js';
import type { ProviderOAuth2 } from '@nangohq/types';

describe('shouldRefreshCredentials', () => {
    describe('facebook', () => {
        it('should return true if facebook and instant refresh', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', raw: {}, expires_at: new Date(Date.now() + 10000) },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'facebook' } as Config
            });

            expect(res).toStrictEqual({ should: true, reason: 'facebook' });
        });

        it('should return false if facebook and not instant refresh', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', raw: {}, expires_at: new Date(Date.now() + 10000) },
                instantRefresh: false,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'facebook' } as Config
            });

            expect(res).toStrictEqual({ should: false, reason: 'facebook' });
        });
    });

    describe('refresh token', () => {
        it('should return false if instant refresh but no refresh token', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', raw: {} },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'github' } as Config
            });

            expect(res).toStrictEqual({ should: false, reason: 'expired_oauth2_no_refresh_token' });
        });

        it('should return true if instant refresh and refresh token', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', refresh_token: 'hello', raw: {} },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'github' } as Config
            });

            expect(res).toStrictEqual({ should: true, reason: 'expired_oauth2_with_refresh_token' });
        });
    });

    describe('refresh token', () => {
        it('should return false if instant refresh but no refresh token', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', raw: {} },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'github' } as Config
            });

            expect(res).toStrictEqual({ should: false, reason: 'expired_oauth2_no_refresh_token' });
        });

        it('should return true if instant refresh and refresh token', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', refresh_token: 'hello', raw: {} },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'github' } as Config
            });

            expect(res).toStrictEqual({ should: true, reason: 'expired_oauth2_with_refresh_token' });
        });
    });

    describe('expires_at', () => {
        it('should return true if instant refresh even if not expired', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2_CC', client_id: '', client_secret: '', token: '', expires_at: new Date(Date.now() + 10000), raw: {} },
                instantRefresh: true,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'brightcrowd' } as Config
            });

            expect(res).toStrictEqual({ should: true, reason: 'instant_refresh' });
        });

        it('should return true if expired', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2_CC', client_id: '', client_secret: '', token: '', expires_at: new Date(Date.now() - 10000), raw: {} },
                instantRefresh: false,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'brightcrowd' } as Config
            });

            expect(res).toStrictEqual({ should: true, reason: 'expired' });
        });

        it('should return false if not expired', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: {
                    type: 'OAUTH2_CC',
                    client_id: '',
                    client_secret: '',
                    token: '',
                    expires_at: new Date(Date.now() + REFRESH_MARGIN_MS * 2),
                    raw: {}
                },
                instantRefresh: false,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'brightcrowd' } as Config
            });

            expect(res).toStrictEqual({ should: false, reason: 'fresh' });
        });

        it('should return false if no credentials.expires_at', async () => {
            const connection = getTestConnection();
            const res = await shouldRefreshCredentials({
                connection,
                credentials: { type: 'OAUTH2', access_token: '', refresh_token: 'token', raw: {} },
                instantRefresh: false,
                provider: { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                providerConfig: { provider: 'brightcrowd' } as Config
            });

            expect(res).toStrictEqual({ should: false, reason: 'no_expires_at' });
        });
    });
});

describe('refreshCredentialsIfNeeded', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return refresh_token_lock_timeout (503) when Redis lock times out, not refresh_token_external_error (400)', async () => {
        const connection = getTestConnection({
            connection_id: 'test-conn',
            environment_id: 42,
            provider_config_key: 'airtable',
            credentials: {
                type: 'OAUTH2',
                access_token: 'old_token',
                refresh_token: 'old_refresh',
                expires_at: new Date(Date.now() - 1000),
                raw: {}
            }
        });

        vi.spyOn(connectionService, 'getConnection').mockResolvedValue({
            success: true,
            error: null,
            response: connection
        } as any);

        vi.spyOn(kvstoreModule, 'getLocking').mockResolvedValue({
            tryAcquire: vi.fn().mockRejectedValue(new LockTimeoutError('lock:refresh:42:airtable:test-conn', 12000)),
            release: vi.fn().mockResolvedValue(undefined)
        } as any);

        const res = await refreshCredentialsIfNeeded({
            connectionId: 'test-conn',
            environmentId: 42,
            environment_id: 42,
            providerConfig: { unique_key: 'airtable', provider: 'airtable' } as Config,
            provider: { auth_mode: 'OAUTH2', token_expiration_buffer: 0 } as ProviderOAuth2,
            instantRefresh: false,
            logCtx: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
        });

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.type).toBe('refresh_token_lock_timeout');
            expect(res.error.status).toBe(503);
        }
    });
});
