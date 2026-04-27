import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer } from '../../../utils/tests.js';

import type { ApiKeyScope } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

/**
 * NAN-5088: Scope enforcement tests.
 *
 * For each public API route group, verify that:
 * 1. A key WITH the required scope passes (not 403)
 * 2. A key WITHOUT the required scope is denied (403)
 *
 * We use a "wrong" scope (one that doesn't match) to test denial.
 * We don't validate the full response — just that scope enforcement is wired.
 * The actual status may be 200, 400, 404, etc. depending on the endpoint's validation,
 * but it must NOT be 403 when the correct scope is present.
 */

const WRONG_SCOPE = 'environment:mcp'; // unlikely to match any route except /mcp

async function createKeyWithScopes(scopes: ApiKeyScope[]): Promise<string> {
    const result = await createKeyWithScopesAndEnv(scopes);
    return result.secret;
}

async function createKeyWithScopesAndEnv(scopes: ApiKeyScope[]) {
    const { env, user } = await seeders.seedAccountEnvAndUser();
    const session = await authenticateUser(api, user);
    const res = await api.fetch('/api/v1/environment/api-keys', {
        method: 'POST',
        // @ts-expect-error query params are required
        query: { env: env.name },
        body: { display_name: 'test', scopes },
        session
    });
    isSuccess(res.json);
    return { secret: res.json.data.secret, env };
}

describe('Scope enforcement on public API routes', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    // ── Integrations ────────────────────────────────────────────────

    describe('GET /integrations', () => {
        it('should allow with integrations:list scope', async () => {
            const token = await createKeyWithScopes(['environment:integrations:list']);
            const res = await api.fetch('/integrations', { method: 'GET', token } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without integrations scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations', { method: 'GET', token } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('POST /integrations', () => {
        it('should allow with integrations:write scope', async () => {
            const token = await createKeyWithScopes(['environment:integrations:write']);
            const res = await api.fetch('/integrations', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without integrations:write scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('POST /integrations/quickstart', () => {
        it('should allow with integrations:write scope', async () => {
            const token = await createKeyWithScopes(['environment:integrations:write']);
            const res = await api.fetch('/integrations/quickstart', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without integrations:write scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations/quickstart', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('GET /integrations/:uniqueKey', () => {
        it('should allow with integrations:read scope', async () => {
            const token = await createKeyWithScopes(['environment:integrations:read']);
            const res = await api.fetch('/integrations/:uniqueKey' as any, { method: 'GET', token, params: { uniqueKey: 'nonexistent' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without integrations:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations/:uniqueKey' as any, { method: 'GET', token, params: { uniqueKey: 'nonexistent' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('DELETE /integrations/:uniqueKey', () => {
        it('should allow with integrations:write scope', async () => {
            const token = await createKeyWithScopes(['environment:integrations:write']);
            const res = await api.fetch('/integrations/:uniqueKey' as any, { method: 'DELETE', token, params: { uniqueKey: 'nonexistent' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without integrations:write scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations/:uniqueKey' as any, { method: 'DELETE', token, params: { uniqueKey: 'nonexistent' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Connections ──────────────────────────────────────────────────

    describe('GET /connections', () => {
        it('should allow with connections:list scope', async () => {
            const token = await createKeyWithScopes(['environment:connections:list']);
            const res = await api.fetch('/connections', { method: 'GET', token } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without connections scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/connections', { method: 'GET', token } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('GET /connections/:connectionId', () => {
        it('should allow with connections:read scope', async () => {
            const token = await createKeyWithScopes(['environment:connections:read']);
            const res = await api.fetch('/connections/:connectionId' as any, { method: 'GET', token, params: { connectionId: 'nonexistent' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without connections:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/connections/:connectionId' as any, { method: 'GET', token, params: { connectionId: 'nonexistent' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('DELETE /connections/:connectionId', () => {
        it('should allow with connections:write scope', async () => {
            const token = await createKeyWithScopes(['environment:connections:write']);
            const res = await api.fetch('/connections/:connectionId' as any, { method: 'DELETE', token, params: { connectionId: 'nonexistent' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without connections:write scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/connections/:connectionId' as any, { method: 'DELETE', token, params: { connectionId: 'nonexistent' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Connect Sessions ────────────────────────────────────────────

    describe('POST /connect/sessions', () => {
        it('should allow with connect_sessions:write scope', async () => {
            const token = await createKeyWithScopes(['environment:connect_sessions:write']);
            const res = await api.fetch('/connect/sessions', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without connect_sessions:write scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/connect/sessions', { method: 'POST', token, body: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Deploy ───────────────────────────────────────────────────────

    describe('POST /sync/deploy', () => {
        it('should allow with deploy scope', async () => {
            const token = await createKeyWithScopes(['environment:deploy']);
            const res = await api.fetch('/sync/deploy' as any, { method: 'POST', token, body: {}, headers: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without deploy scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/sync/deploy' as any, { method: 'POST', token, body: {}, headers: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Records ──────────────────────────────────────────────────────

    describe('GET /records', () => {
        it('should allow with records:read scope', async () => {
            const token = await createKeyWithScopes(['environment:records:read']);
            const res = await api.fetch('/records' as any, { method: 'GET', token, query: { model: 'test' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without records:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/records' as any, { method: 'GET', token, query: { model: 'test' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Syncs ────────────────────────────────────────────────────────

    describe('POST /sync/trigger', () => {
        it('should allow with syncs:execute scope', async () => {
            const token = await createKeyWithScopes(['environment:syncs:execute']);
            const res = await api.fetch('/sync/trigger' as any, { method: 'POST', token, body: {}, headers: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without syncs:execute scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/sync/trigger' as any, { method: 'POST', token, body: {}, headers: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('GET /sync/status', () => {
        it('should allow with syncs:read scope', async () => {
            const token = await createKeyWithScopes(['environment:syncs:read']);
            const res = await api.fetch('/sync/status' as any, { method: 'GET', token, query: { syncs: 'test', provider_config_key: 'test' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without syncs:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/sync/status' as any, { method: 'GET', token, query: { syncs: 'test', provider_config_key: 'test' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Actions ──────────────────────────────────────────────────────

    describe('POST /action/trigger', () => {
        it('should allow with actions:execute scope', async () => {
            const token = await createKeyWithScopes(['environment:actions:execute']);
            const res = await api.fetch(
                '/action/trigger' as any,
                { method: 'POST', token, body: { action_name: 'test', input: {} }, headers: { 'provider-config-key': 'test', 'connection-id': 'test' } } as any
            );
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without actions:execute scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch(
                '/action/trigger' as any,
                { method: 'POST', token, body: { action_name: 'test', input: {} }, headers: { 'provider-config-key': 'test', 'connection-id': 'test' } } as any
            );
            expect(res.res.status).toBe(403);
        });
    });

    // ── V1 passthrough (deprecated) ───────────────────────────────────
    // These tests need real connections and sync configs because the scope check
    // happens after the connection lookup and action/model resolution.

    describe('POST /v1/* (action via legacy passthrough)', () => {
        it('should allow with actions:execute scope', async () => {
            const { secret, env } = await createKeyWithScopesAndEnv(['environment:actions:execute']);
            const config = await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github', connectionId: 'v1-action-allow' });
            await seeders.createSyncSeeds({
                connectionId: conn.id,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'my-action',
                type: 'action',
                endpoints: [{ method: 'POST', path: '/my-action' }]
            });
            const res = await api.fetch(
                '/v1/my-action' as any,
                {
                    method: 'POST',
                    token: secret,
                    body: {},
                    headers: { 'provider-config-key': 'github', 'connection-id': 'v1-action-allow' }
                } as any
            );
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without actions:execute scope', async () => {
            const { secret, env } = await createKeyWithScopesAndEnv([WRONG_SCOPE]);
            const config = await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github', connectionId: 'v1-action-deny' });
            await seeders.createSyncSeeds({
                connectionId: conn.id,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'my-action',
                type: 'action',
                endpoints: [{ method: 'POST', path: '/my-action' }]
            });
            const res = await api.fetch(
                '/v1/my-action' as any,
                {
                    method: 'POST',
                    token: secret,
                    body: {},
                    headers: { 'provider-config-key': 'github', 'connection-id': 'v1-action-deny' }
                } as any
            );
            expect(res.res.status).toBe(403);
        });
    });

    describe('GET /v1/* (records via legacy passthrough)', () => {
        it('should allow with records:read scope', async () => {
            const { secret, env } = await createKeyWithScopesAndEnv(['environment:records:read']);
            const config = await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github', connectionId: 'v1-records-allow' });
            await seeders.createSyncSeeds({
                connectionId: conn.id,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'my-sync',
                type: 'sync',
                models: ['MyModel'],
                endpoints: [{ method: 'GET', path: '/my-model', model: 'MyModel' }]
            });
            const res = await api.fetch(
                '/v1/my-model' as any,
                {
                    method: 'GET',
                    token: secret,
                    headers: { 'provider-config-key': 'github', 'connection-id': 'v1-records-allow' }
                } as any
            );
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without records:read scope', async () => {
            const { secret, env } = await createKeyWithScopesAndEnv([WRONG_SCOPE]);
            const config = await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github', connectionId: 'v1-records-deny' });
            await seeders.createSyncSeeds({
                connectionId: conn.id,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'my-sync',
                type: 'sync',
                models: ['MyModel'],
                endpoints: [{ method: 'GET', path: '/my-model', model: 'MyModel' }]
            });
            const res = await api.fetch(
                '/v1/my-model' as any,
                {
                    method: 'GET',
                    token: secret,
                    headers: { 'provider-config-key': 'github', 'connection-id': 'v1-records-deny' }
                } as any
            );
            expect(res.res.status).toBe(403);
        });
    });

    // ── Proxy ────────────────────────────────────────────────────────

    describe('GET /proxy/*', () => {
        it('should allow with proxy scope', async () => {
            const token = await createKeyWithScopes(['environment:proxy']);
            const res = await api.fetch('/proxy/:anyPath' as any, { method: 'GET', token, params: { anyPath: 'test' } } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without proxy scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/proxy/:anyPath' as any, { method: 'GET', token, params: { anyPath: 'test' } } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Config ───────────────────────────────────────────────────────

    describe('GET /environment-variables', () => {
        it('should allow with config:read scope', async () => {
            const token = await createKeyWithScopes(['environment:config:read']);
            const res = await api.fetch('/environment-variables' as any, { method: 'GET', token } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without config:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/environment-variables' as any, { method: 'GET', token } as any);
            expect(res.res.status).toBe(403);
        });
    });

    describe('GET /scripts/config', () => {
        it('should allow with config:read scope', async () => {
            const token = await createKeyWithScopes(['environment:config:read']);
            const res = await api.fetch('/scripts/config', { method: 'GET', token } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without config:read scope', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/scripts/config', { method: 'GET', token } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── MCP ──────────────────────────────────────────────────────────

    describe('POST /mcp', () => {
        it('should allow with mcp scope', async () => {
            const token = await createKeyWithScopes(['environment:mcp']);
            const res = await api.fetch('/mcp' as any, { method: 'POST', token, body: {} } as any);
            expect(res.res.status).not.toBe(403);
        });

        it('should deny without mcp scope', async () => {
            const token = await createKeyWithScopes(['environment:deploy']);
            const res = await api.fetch('/mcp' as any, { method: 'POST', token, body: {} } as any);
            expect(res.res.status).toBe(403);
        });
    });

    // ── Wildcard ─────────────────────────────────────────────────────

    describe('wildcard scope', () => {
        it('environment:* should grant access to all routes', async () => {
            const token = await createKeyWithScopes(['environment:*']);

            const routes: { path: string; method: string; extra?: Record<string, unknown> }[] = [
                { path: '/integrations', method: 'GET' },
                { path: '/connections', method: 'GET' },
                { path: '/scripts/config', method: 'GET' }
            ];

            for (const route of routes) {
                const res = await api.fetch(route.path as any, { method: route.method, token, ...route.extra } as any);
                expect(res.res.status).not.toBe(403);
            }
        });

        it('environment:integrations:* should grant access to all integration routes', async () => {
            const token = await createKeyWithScopes(['environment:integrations:*']);

            // Should work
            const listRes = await api.fetch('/integrations', { method: 'GET', token } as any);
            expect(listRes.res.status).not.toBe(403);

            // Should not work for connections
            const connRes = await api.fetch('/connections', { method: 'GET', token } as any);
            expect(connRes.res.status).toBe(403);
        });
    });

    // ── Credential stripping ─────────────────────────────────────────

    describe('credential stripping based on scope', () => {
        it('GET /connections/:id with read scope should strip credentials', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            await seeders.createConnectionSeed({
                env,
                provider: 'github',
                connectionId: 'test-conn',
                rawCredentials: { type: 'OAUTH2', access_token: 'secret-token-123', raw: {} } as any
            });

            const session = await authenticateUser(api, user);

            // Create key with read only (no credentials)
            const readKey = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params
                query: { env: env.name },
                body: { display_name: 'read-only', scopes: ['environment:connections:read'] },
                session
            });
            isSuccess(readKey.json);

            const res = await api.fetch(
                '/connections/:connectionId' as any,
                {
                    method: 'GET',
                    token: readKey.json.data.secret,
                    params: { connectionId: 'test-conn' },
                    query: { provider_config_key: 'github' }
                } as any
            );

            expect(res.res.status).toBe(200);
            // Credentials should be empty/stripped
            expect(res.json.credentials).toEqual({});
        });

        it('GET /connections/:id with read_credentials scope should include credentials', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            await seeders.createConnectionSeed({
                env,
                provider: 'github',
                connectionId: 'test-conn-creds',
                rawCredentials: { type: 'OAUTH2', access_token: 'secret-token-456', raw: {} } as any
            });

            const session = await authenticateUser(api, user);

            // Create key with read_credentials
            const credKey = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params
                query: { env: env.name },
                body: { display_name: 'with-creds', scopes: ['environment:connections:read_credentials'] },
                session
            });
            isSuccess(credKey.json);

            const res = await api.fetch(
                '/connections/:connectionId' as any,
                {
                    method: 'GET',
                    token: credKey.json.data.secret,
                    params: { connectionId: 'test-conn-creds' },
                    query: { provider_config_key: 'github' }
                } as any
            );

            expect(res.res.status).toBe(200);
            // Credentials should be present
            expect(res.json.credentials).toBeDefined();
            expect(res.json.credentials.access_token).toBeTruthy();
        });

        it('GET /integrations/:key?include=credentials with read scope should not include credentials', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');

            const session = await authenticateUser(api, user);

            // Create key with read only
            const readKey = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params
                query: { env: env.name },
                body: { display_name: 'int-read', scopes: ['environment:integrations:read'] },
                session
            });
            isSuccess(readKey.json);

            const res = await api.fetch(
                '/integrations/:uniqueKey' as any,
                {
                    method: 'GET',
                    token: readKey.json.data.secret,
                    params: { uniqueKey: 'github' },
                    query: { include: 'credentials' }
                } as any
            );

            expect(res.res.status).toBe(200);
            // Credentials should NOT be included (scope doesn't allow it)
            expect(res.json.data.credentials).toBeUndefined();
        });

        it('GET /integrations/:key?include=credentials with read_credentials scope should include credentials', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');

            const session = await authenticateUser(api, user);

            // Create key with read_credentials
            const credKey = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params
                query: { env: env.name },
                body: { display_name: 'int-creds', scopes: ['environment:integrations:read_credentials'] },
                session
            });
            isSuccess(credKey.json);

            const res = await api.fetch(
                '/integrations/:uniqueKey' as any,
                {
                    method: 'GET',
                    token: credKey.json.data.secret,
                    params: { uniqueKey: 'github' },
                    query: { include: 'credentials' }
                } as any
            );

            expect(res.res.status).toBe(200);
            // Credentials should be included
            expect(res.json.data.credentials).toBeDefined();
        });

        it('api_secrets key with Nango-Is-Script header should include credentials (internal key path)', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            await seeders.createConnectionSeed({
                env,
                provider: 'github',
                connectionId: 'test-conn-internal',
                rawCredentials: { type: 'OAUTH2', access_token: 'internal-token', raw: {} } as any
            });

            const res = await fetch(`${api.url}/connections/test-conn-internal?provider_config_key=github`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${secret.secret}`,
                    'Nango-Is-Script': 'true'
                }
            });
            const json = await res.json();

            expect(res.status).toBe(200);
            // Internal keys get environment:* scopes — credentials included
            expect(json.credentials).toBeDefined();
            expect(json.credentials.access_token).toBeTruthy();
        });
    });

    // ── Internal script key (Nango-Is-Script header) ────────────────

    describe('internal script key access', () => {
        it('should allow access to scoped routes with Nango-Is-Script header', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();

            // Use raw fetch to send custom Nango-Is-Script header
            const res = await fetch(`${api.url}/connections`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${secret.secret}`,
                    'Nango-Is-Script': 'true'
                }
            });
            expect(res.status).toBe(200);
        });

        it('should deny access without Nango-Is-Script header when using restricted customer key', async () => {
            const token = await createKeyWithScopes([WRONG_SCOPE]);
            const res = await api.fetch('/integrations', { method: 'GET', token } as any);
            expect(res.res.status).toBe(403);
        });
    });
});
