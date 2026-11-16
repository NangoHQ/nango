import http from 'node:http';

import { describe, expect, it, vi } from 'vitest';

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

describe('deputy', () => {
    async function withDeputyServer(fn: (host: string, requests: { url: string; body: string }[]) => Promise<void>): Promise<void> {
        const requests: { url: string; body: string }[] = [];
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                requests.push({ url: req.url ?? '', body });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ access_token: 'new', refresh_token: 'rotated', expires_in: 86400, endpoint: 'acme.na.deputy.com' }));
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;
        try {
            await fn(`127.0.0.1:${port}`, requests);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    }
    const deputy = { ...config, unique_key: 'deputy', provider: 'deputy', oauth_scopes: '' } as unknown as ProviderConfig;
    const provider = {
        auth_mode: 'OAUTH2',
        token_url: 'https://once.deputy.com/my/oauth/access_token',
        refresh_url: 'http://${connectionConfig.endpoint}/oauth/access_token',
        token_params: { grant_type: 'authorization_code', scope: 'longlife_refresh_token' },
        refresh_params: { grant_type: 'refresh_token', scope: 'longlife_refresh_token' }
    } as unknown as ProviderOAuth2;

    it('exchanges the code with the token_params', async () => {
        await withDeputyServer(async (host, requests) => {
            const token = await providerClient.getToken(deputy, provider, `http://${host}/my/oauth/access_token`, 'the-code', 'https://cb', '');
            expect(Object.fromEntries(new URLSearchParams(requests[0]!.body))).toEqual({
                grant_type: 'authorization_code',
                scope: 'longlife_refresh_token',
                client_id: 'client-id',
                client_secret: 'client-secret',
                redirect_uri: 'https://cb',
                code: 'the-code'
            });
            expect(token).toMatchObject({ access_token: 'new', endpoint: 'acme.na.deputy.com' });
        });
    });

    it('refreshes on refresh_url (the install), not on token_url', async () => {
        await withDeputyServer(async (host, requests) => {
            const connection = {
                credentials: { type: 'OAUTH2', access_token: 'old', refresh_token: 'refresh', raw: {} },
                connection_config: { endpoint: host }
            } as unknown as DBConnectionDecrypted;
            const token = await providerClient.refreshToken(provider, deputy, connection, 'https://cb');
            expect(requests[0]!.url).toBe('/oauth/access_token');
            expect(Object.fromEntries(new URLSearchParams(requests[0]!.body))).toMatchObject({ grant_type: 'refresh_token', scope: 'longlife_refresh_token', refresh_token: 'refresh' });
            expect(token).toMatchObject({ access_token: 'new', refresh_token: 'rotated' });
        });
    });
});
