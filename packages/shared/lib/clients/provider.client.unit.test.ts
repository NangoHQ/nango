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

async function withNuvemshopTokenServer(
    payload: Record<string, unknown>,
    fn: (tokenUrl: string, bodies: { contentType: string | undefined; body: string }[]) => Promise<void>
): Promise<void> {
    const bodies: { contentType: string | undefined; body: string }[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            bodies.push({ contentType: req.headers['content-type'], body });
            // Nuvemshop answers with a JSON body, a `text/html` content type and a 200 status, even for errors.
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end(JSON.stringify(payload));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}/apps/authorize/token`, bodies);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

const nuvemshopConfig = {
    id: 2,
    unique_key: 'nuvemshop',
    provider: 'nuvemshop',
    oauth_client_id: '12345',
    oauth_client_secret: 'client-secret',
    oauth_scopes: '',
    environment_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    missing_fields: []
} as unknown as ProviderConfig;

describe('nuvemshop token exchange', () => {
    it('parses a JSON body served as text/html and returns user_id as a string', async () => {
        await withNuvemshopTokenServer(
            { access_token: 'token', token_type: 'bearer', scope: 'read_products,write_orders', user_id: 7654321 },
            async (tokenUrl, bodies) => {
                const raw = (await providerClient.getToken(
                    nuvemshopConfig,
                    { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                    tokenUrl,
                    'the-code',
                    'https://cb',
                    ''
                )) as Record<string, unknown>;

                expect(raw['access_token']).toBe('token');
                expect(raw['scope']).toBe('read_products,write_orders');
                // token_response_metadata only keeps string or boolean values
                expect(raw['user_id']).toBe('7654321');

                expect(bodies[0]?.contentType).toContain('application/json');
                expect(JSON.parse(bodies[0]!.body)).toEqual({
                    client_id: '12345',
                    client_secret: 'client-secret',
                    grant_type: 'authorization_code',
                    code: 'the-code'
                });
            }
        );
    });

    it('falls back to store_id when user_id is absent', async () => {
        await withNuvemshopTokenServer({ access_token: 'token', token_type: 'bearer', store_id: 42 }, async (tokenUrl) => {
            const raw = (await providerClient.getToken(
                nuvemshopConfig,
                { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                tokenUrl,
                'the-code',
                'https://cb',
                ''
            )) as Record<string, unknown>;
            expect(raw['user_id']).toBe('42');
        });
    });

    it('throws when the 200 response carries an error', async () => {
        await withNuvemshopTokenServer({ error: 'invalid_client', error_description: 'The client credentials are invalid' }, async (tokenUrl) => {
            await expect(
                providerClient.getToken(nuvemshopConfig, { auth_mode: 'OAUTH2' } as ProviderOAuth2, tokenUrl, 'the-code', 'https://cb', '')
            ).rejects.toThrow(/invalid_client/);
        });
    });

    it('uses the provider client for nuvemshop', () => {
        expect(providerClient.shouldUseProviderClient('nuvemshop')).toBe(true);
    });
});
