import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance } from '@nangohq/utils';

import providerClient from './provider.client.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { DBConnectionDecrypted, ProviderOAuth2 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// Loopback is always blocked by the real egress policy; neutralise it so the test token endpoint is reachable.
vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        getOAuthAxiosRequestConfig: vi.fn(() => ({}))
    };
});

async function withTokenServer(fn: (tokenUrl: string, bodies: string[]) => Promise<void>): Promise<void> {
    const bodies: string[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            bodies.push(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ access_token: 'token', token_type: 'Bearer', expires_in: 3599 }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}/tenant/oauth2/v2.0/token`, bodies);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

const config = {
    id: 1,
    unique_key: 'microsoft-admin',
    provider: 'microsoft-admin',
    oauth_client_id: 'client-id',
    oauth_client_secret: 'client-secret',
    oauth_scopes: 'https://graph.microsoft.com/.default',
    environment_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    missing_fields: []
} as unknown as ProviderConfig;

describe('microsoft-admin client_credentials', () => {
    // Microsoft rejects a double-encoded scope with AADSTS1002012 ("scope https%3A%2F%2Fgraph.microsoft.com%2F.default is not valid").
    it('sends the scope form-encoded exactly once on token creation', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            await providerClient.getToken(config, { auth_mode: 'OAUTH2' } as ProviderOAuth2, tokenUrl, 'unused', 'https://cb', '');
            expect(new URLSearchParams(bodies[0]).get('scope')).toBe('https://graph.microsoft.com/.default');
        });
    });

    it('sends the scope form-encoded exactly once on refresh', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            const provider = { auth_mode: 'OAUTH2', token_url: tokenUrl } as ProviderOAuth2;
            const connection = {
                credentials: { type: 'OAUTH2', access_token: 'old', raw: {} },
                connection_config: {}
            } as unknown as DBConnectionDecrypted;
            await providerClient.refreshToken(provider, config, connection);
            expect(new URLSearchParams(bodies[0]).get('scope')).toBe('https://graph.microsoft.com/.default');
        });
    });
});

describe('instagram', () => {
    const instagramConfig = { ...config, unique_key: 'instagram', provider: 'instagram', oauth_scopes: '' } as unknown as ProviderConfig;
    const instagramProvider = {
        auth_mode: 'OAUTH2',
        token_url: 'https://api.instagram.com/oauth/access_token',
        refresh_url: 'https://graph.instagram.com/refresh_access_token'
    } as ProviderOAuth2;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the granted permissions from the short-lived token when exchanging for a long-lived one', async () => {
        vi.spyOn(axiosInstance, 'post').mockResolvedValue({
            status: 200,
            data: { access_token: 'short-lived', user_id: 123, permissions: 'instagram_business_basic,instagram_business_content_publish' }
        });
        vi.spyOn(axiosInstance, 'get').mockResolvedValue({ status: 200, data: { access_token: 'long-lived', token_type: 'bearer', expires_in: 5183944 } });

        const raw = await providerClient.getToken(instagramConfig, instagramProvider, instagramProvider.token_url as string, 'code', 'https://cb', '');

        expect(raw).toEqual({
            access_token: 'long-lived',
            token_type: 'bearer',
            expires_in: 5183944,
            user_id: 123,
            permissions: 'instagram_business_basic,instagram_business_content_publish'
        });
    });

    it('carries the granted permissions over on refresh', async () => {
        vi.spyOn(axiosInstance, 'get').mockResolvedValue({ status: 200, data: { access_token: 'refreshed', token_type: 'bearer', expires_in: 5183944 } });
        const connection = {
            credentials: {
                type: 'OAUTH2',
                access_token: 'long-lived',
                raw: { access_token: 'long-lived', user_id: 123, permissions: 'instagram_business_basic' }
            },
            connection_config: {}
        } as unknown as DBConnectionDecrypted;

        const raw = await providerClient.refreshToken(instagramProvider, instagramConfig, connection);

        expect(raw).toEqual({ access_token: 'refreshed', token_type: 'bearer', expires_in: 5183944, user_id: 123, permissions: 'instagram_business_basic' });
    });
});
