import { generateKeyPairSync } from 'node:crypto';
import { request as httpRequest } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { OAuthProvider } from '@nangohq/oauth-server';
import type { Server } from 'node:http';

const CLIENT_ID = 'https://example.com/metadata.json';
const RESOURCE = 'https://mcp-test.nango.dev/mcp';

interface UndiciFetch {
    (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface UndiciModule {
    fetch: UndiciFetch;
    Response: new (body?: BodyInit | null, init?: ResponseInit) => Response;
}

// vi.mock isolates this file. The issuer env is set before the server module loads; the shared
// integration process imports the server while the issuer is off. The mock only replaces the CIMD
// document fetch. Token, grant, and client resolution stay on the issuer.
vi.mock('undici', async (importOriginal) => {
    const loaded = await importOriginal();
    if (!loaded || typeof loaded !== 'object' || !('fetch' in loaded) || !('Response' in loaded)) {
        throw new Error('Invalid undici mock');
    }
    const actual = loaded as UndiciModule;
    return {
        ...actual,
        fetch: (input: Parameters<UndiciFetch>[0], init?: RequestInit) => {
            const url = fetchedUrl(input);
            if (url === CLIENT_ID) {
                return Promise.resolve(
                    new actual.Response(
                        JSON.stringify({
                            client_id: CLIENT_ID,
                            redirect_uris: ['https://example.com/callback'],
                            grant_types: ['authorization_code', 'refresh_token'],
                            response_types: ['code'],
                            token_endpoint_auth_method: 'none',
                            application_type: 'web',
                            scope: 'environment:*'
                        }),
                        { status: 200, headers: { 'content-type': 'application/json' } }
                    )
                );
            }
            return actual.fetch(input, init);
        }
    };
});

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env['NANGO_SERVER_URL'] = 'http://localhost:3003';
process.env['NANGO_DASHBOARD_API_URL'] = 'http://localhost:3003';
process.env['NANGO_OAUTH_SERVER_BASE_URL'] = 'http://localhost:3003';
process.env['NANGO_OAUTH_SERVER_COOKIE_KEYS'] = JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]);
process.env['NANGO_OAUTH_SERVER_JWKS'] = JSON.stringify({
    keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'mcp-oauth-test', use: 'sig', alg: 'RS256' }]
});

describe('T15: MCP OAuth access token', () => {
    let api: { server: Server; url: string };
    let issuer: OAuthProvider;

    beforeAll(async () => {
        const { runServer } = await import('../utils/tests.js');
        const { oauthServer } = await import('../oauth/server.js');
        if (!oauthServer) {
            throw new Error('OAuth issuer did not start');
        }
        issuer = oauthServer;
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('authenticates an access token on the management MCP host', async () => {
        const { seeders } = await import('@nangohq/shared');
        const { user } = await seeders.seedAccountEnvAndUser();
        const token = await mintAccessToken(issuer, user.id);
        const res = await request(`${api.url}/mcp`, {
            Authorization: `Bearer ${token}`,
            Host: 'mcp-test.nango.dev'
        });

        expect(res.status).toBe(405);
        expect(res.json).toEqual({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null
        });
    });
});

function fetchedUrl(input: string | URL | Request): string {
    if (typeof input === 'string') {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    return input.url;
}

// Node fetch strips a custom Host header, which is how the management MCP router is selected.
function request(url: string, headers: Record<string, string>): Promise<{ status: number; json: unknown }> {
    const target = new URL(url);
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            {
                hostname: target.hostname,
                port: target.port,
                path: `${target.pathname}${target.search}`,
                method: 'GET',
                headers
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString();
                    resolve({ status: res.statusCode ?? 0, json: body ? JSON.parse(body) : null });
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

async function mintAccessToken(issuer: OAuthProvider, userId: number): Promise<string> {
    const grant = new issuer.Grant({ accountId: String(userId), clientId: CLIENT_ID });
    grant.addResourceScope(RESOURCE, 'environment:*');
    const grantId = await grant.save();

    const accessToken = new issuer.AccessToken({
        client: { clientId: CLIENT_ID } as never,
        accountId: String(userId),
        grantId,
        scope: 'environment:*',
        gty: 'authorization_code'
    });
    accessToken.setAudience(RESOURCE);
    return accessToken.save();
}
