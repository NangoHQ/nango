import { afterEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance } from '@nangohq/utils';

import { assertSafeOAuthUrl } from '../services/proxy/outbound-policy.js';
import providerClient from './provider.client.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { DBConnectionDecrypted, ProviderOAuth2 } from '@nangohq/types';

vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url)))
    };
});

function makeConfig(): ProviderConfig {
    return {
        id: 1,
        unique_key: 'plaud',
        provider: 'plaud',
        oauth_client_id: 'plaud-client-id',
        oauth_client_secret: 'plaud-client-secret',
        oauth_scopes: '',
        environment_id: 1,
        display_name: 'Plaud',
        forward_webhooks: false,
        shared_credentials_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        missing_fields: []
    };
}

function makeProvider(): ProviderOAuth2 {
    return {
        display_name: 'Plaud',
        docs: 'https://docs.example.com',
        auth_mode: 'OAUTH2',
        authorization_url: 'https://web.plaud.ai/platform/oauth',
        token_url: 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token',
        refresh_url: 'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh'
    } as ProviderOAuth2;
}

function makeConnection(refreshToken = 'existing-refresh-token'): DBConnectionDecrypted {
    return {
        id: 1,
        environment_id: 1,
        connection_config: {},
        credentials: {
            type: 'OAUTH2',
            access_token: 'expired-access-token',
            refresh_token: refreshToken
        }
    } as unknown as DBConnectionDecrypted;
}

describe('ProviderClient Plaud OAuth', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('routes Plaud through the provider client', () => {
        expect(providerClient.shouldUseProviderClient('plaud')).toBe(true);
    });

    it('exchanges the authorization code with PKCE and HTTP Basic client authentication', async () => {
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({
            status: 200,
            data: { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 86400 }
        });
        const provider = makeProvider();

        const result = await providerClient.getToken(
            makeConfig(),
            provider,
            provider.token_url as string,
            'authorization-code',
            'https://api.nango.dev/oauth/callback',
            'pkce-verifier',
            undefined,
            'oauth-state'
        );

        expect(result).toEqual({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 86400 });
        expect(assertSafeOAuthUrl).toHaveBeenCalledWith(provider.token_url);

        const [url, rawBody, requestConfig] = postSpy.mock.calls[0]!;
        expect(url).toBe(provider.token_url);
        expect(Object.fromEntries(new URLSearchParams(rawBody as string))).toEqual({
            grant_type: 'authorization_code',
            code: 'authorization-code',
            client_id: 'plaud-client-id',
            redirect_uri: 'https://api.nango.dev/oauth/callback',
            code_verifier: 'pkce-verifier',
            state: 'oauth-state'
        });
        expect(requestConfig?.headers).toMatchObject({
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from('plaud-client-id:plaud-client-secret').toString('base64')}`
        });
    });

    it('refreshes against the dedicated endpoint without client authentication and keeps a rotated refresh token', async () => {
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({
            status: 200,
            data: { access_token: 'fresh-access-token', refresh_token: 'rotated-refresh-token', expires_in: 86400 }
        });
        const provider = makeProvider();

        const result = await providerClient.refreshToken(provider, makeConfig(), makeConnection());

        expect(result).toEqual({ access_token: 'fresh-access-token', refresh_token: 'rotated-refresh-token', expires_in: 86400 });
        expect(assertSafeOAuthUrl).toHaveBeenCalledWith(provider.token_url);
        expect(assertSafeOAuthUrl).toHaveBeenCalledWith(provider.refresh_url);

        const [url, rawBody, requestConfig] = postSpy.mock.calls[0]!;
        expect(url).toBe(provider.refresh_url);
        expect(Object.fromEntries(new URLSearchParams(rawBody as string))).toEqual({ refresh_token: 'existing-refresh-token' });
        expect(requestConfig?.headers).toMatchObject({
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        });
        expect(requestConfig?.headers).not.toHaveProperty('Authorization');
    });

    it('preserves the existing refresh token when Plaud does not rotate it', async () => {
        vi.spyOn(axiosInstance, 'post').mockResolvedValue({
            status: 200,
            data: { access_token: 'fresh-access-token', expires_in: 86400 }
        });

        await expect(providerClient.refreshToken(makeProvider(), makeConfig(), makeConnection())).resolves.toMatchObject({
            access_token: 'fresh-access-token',
            refresh_token: 'existing-refresh-token'
        });
    });
});
