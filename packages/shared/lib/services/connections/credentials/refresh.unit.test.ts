import { describe, expect, it } from 'vitest';
import { shouldRefreshCredentials } from './refresh.js';
import { getTestConnection } from '../utils.test';
import type { ProviderOAuth2 } from '@nangohq/types';
import type { Config } from '../../../models';
import { REFRESH_MARGIN_S } from '../utils.js';

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
                    expires_at: new Date(Date.now() + REFRESH_MARGIN_S * 2000),
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
