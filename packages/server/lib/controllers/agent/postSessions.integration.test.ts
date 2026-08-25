import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { customerKeyService, seeders } from '@nangohq/shared';
import { baseUrl } from '@nangohq/utils';

import { getAgentSessionByToken } from '../../services/agentSession.service.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBEnvironment, DBSyncConfig, DBTeam, IntegrationConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sessions';
const FIFTEEN_DAYS_IN_MS = 15 * 24 * 60 * 60 * 1000;

async function insertAction({
    environmentId,
    integration,
    name,
    type = 'action'
}: {
    environmentId: number;
    integration: IntegrationConfig;
    name: string;
    type?: 'sync' | 'action';
}): Promise<void> {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: integration.id!,
        sync_name: name,
        type,
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: type === 'sync' ? 'every day' : null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        metadata: {},
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
}

async function seedEnvironment(): Promise<{ account: DBTeam; env: DBEnvironment; token: string }> {
    const seed = await seeders.seedAccountEnvAndUser();
    const key = (
        await customerKeyService.createApiKey(db.knex, {
            accountId: seed.account.id,
            environmentId: seed.env.id,
            displayName: `test-${randomUUID()}`,
            scopes: ['environment:agent_sessions:write']
        })
    ).unwrap();

    return { account: seed.account, env: seed.env, token: key.secret };
}

/**
 * notion has two connections on the same tenant, so it is ambiguous unless narrowed or pinned.
 * slack has one. reddit has actions but no connection at all.
 */
async function seedTenant() {
    const { account, env, token } = await seedEnvironment();

    const notion = await seeders.createConfigSeed(env, 'notion', 'notion');
    const slack = await seeders.createConfigSeed(env, 'slack', 'slack');
    const reddit = await seeders.createConfigSeed(env, 'reddit', 'reddit');

    await insertAction({ environmentId: env.id, integration: notion, name: 'read_doc' });
    await insertAction({ environmentId: env.id, integration: notion, name: 'upsert_doc' });
    await insertAction({ environmentId: env.id, integration: notion, name: 'sync_docs', type: 'sync' });
    await insertAction({ environmentId: env.id, integration: slack, name: 'send_message' });
    await insertAction({ environmentId: env.id, integration: reddit, name: 'search_posts' });

    const notionMarketing = await seeders.createConnectionSeed({
        env,
        provider: 'notion',
        connectionId: 'notion-marketing',
        tags: { tenant: 'acme', workspace: 'marketing' }
    });
    await seeders.createConnectionSeed({ env, provider: 'notion', connectionId: 'notion-eng', tags: { tenant: 'acme', workspace: 'eng' } });
    await seeders.createConnectionSeed({ env, provider: 'slack', connectionId: 'slack-acme', tags: { tenant: 'acme', workspace: 'marketing' } });

    return { account, env, token, notionMarketing };
}

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        await keystore.migrate(db.knex);
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'POST', body: { tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } } } });

        shouldBeProtected(res);
    });

    it('should reject a key without the agent_sessions:write scope', async () => {
        const seed = await seeders.seedAccountEnvAndUser();
        const key = (
            await customerKeyService.createApiKey(db.knex, {
                accountId: seed.account.id,
                environmentId: seed.env.id,
                displayName: `test-${randomUUID()}`,
                scopes: ['environment:connect_sessions:write']
            })
        ).unwrap();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: key.secret,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } } }
        });

        expect(res.res.status).toBe(403);
    });

    it('creates a session over the tenant connections, with every action searchable by default', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } } }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(201);
        expect(res.json.data.mcp_url).toBe(`${baseUrl}/session/${res.json.data.session_id}/mcp`);
        expect(res.json.data.meta_tools).toStrictEqual({ nango_tool_search: true, nango_execute: true });

        // The sync on notion is not a tool, and reddit has no connection so the default toolset leaves it out.
        expect(res.json.data.toolset).toStrictEqual({
            notion: { connected: true, tools_pinned: 0, tools_searchable: 2 },
            slack: { connected: true, tools_pinned: 0, tools_searchable: 1 }
        });

        const expiresIn = new Date(res.json.data.expires_at).getTime() - Date.now();
        expect(expiresIn).toBeGreaterThan(FIFTEEN_DAYS_IN_MS - 60_000);
        expect(expiresIn).toBeLessThanOrEqual(FIFTEEN_DAYS_IN_MS);

        const session = (await getAgentSessionByToken(db.knex, res.json.data.session_token)).unwrap();
        expect(session.id).toBe(res.json.data.session_id);
        expect(session.resolvedConnections['notion']?.connectionId).toBe('notion-marketing');
        expect(session.resolvedConnections['slack']?.connectionId).toBe('slack-acme');
    });

    it('exposes an integration with no connection when the toolset asks for the whole environment', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } }, toolset: '*' }
        });

        isSuccess(res.json);
        expect(res.json.data.toolset['reddit']).toStrictEqual({ connected: false, tools_pinned: 0, tools_searchable: 1 });
    });

    it('applies the toolset policy and the pinned tools it was given', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: {
                tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } },
                toolset: { notion: { allow: { tools: ['read_doc', 'upsert_doc'] } }, slack: '*' },
                pinned_tools: { notion: ['read_doc'] },
                meta_tools: { nango_execute: false }
            }
        });

        isSuccess(res.json);
        expect(res.json.data.toolset).toStrictEqual({
            notion: { connected: true, tools_pinned: 1, tools_searchable: 1 },
            slack: { connected: true, tools_pinned: 0, tools_searchable: 1 }
        });
        expect(res.json.data.meta_tools.nango_execute).toBe(false);
    });

    it('honours expires_in', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } }, toolset: { slack: '*' }, expires_in: '2h' }
        });

        isSuccess(res.json);
        const expiresIn = new Date(res.json.data.expires_at).getTime() - Date.now();
        expect(expiresIn).toBeGreaterThan(2 * 60 * 60 * 1000 - 60_000);
        expect(expiresIn).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
    });

    it.each(['16d', '30s'])('rejects an expires_in outside the bounds (%s)', async (expiresIn) => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } }, expires_in: expiresIn }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('fails without creating a session when an integration matches several connections', async () => {
        const { token, env } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } } }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('ambiguous_connections');
        expect(res.json.error.payload).toStrictEqual({
            integrations: {
                notion: {
                    match_count: 2,
                    candidates: expect.arrayContaining([
                        { connection_id: 'notion-marketing', tags: { tenant: 'acme', workspace: 'marketing' } },
                        { connection_id: 'notion-eng', tags: { tenant: 'acme', workspace: 'eng' } }
                    ])
                }
            }
        });

        const sessions = await db.knex('agent_sessions').where({ environment_id: env.id });
        expect(sessions).toHaveLength(0);
    });

    it('lets a pinned connection break the ambiguity', async () => {
        const { token, notionMarketing } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: {
                tenant: {
                    connections: {
                        any: [{ tags: { tenant: 'acme' } }],
                        pinned: [{ integration_id: 'notion', connection_id: notionMarketing.connection_id }]
                    }
                }
            }
        });

        isSuccess(res.json);
        const session = (await getAgentSessionByToken(db.knex, res.json.data.session_token)).unwrap();
        expect(session.resolvedConnections['notion']?.connectionId).toBe('notion-marketing');
    });

    it('rejects a toolset naming an integration the environment does not have', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } }, toolset: { hubspot: '*' } }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('unknown_integration');
        expect(res.json.error.payload).toStrictEqual({ integrations: ['hubspot'] });
    });

    it('rejects a toolset naming a function that is not an action', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: {
                tenant: { connections: { any: [{ tags: { tenant: 'acme', workspace: 'marketing' } }] } },
                toolset: { notion: { allow: { tools: ['sync_docs'] } } }
            }
        });

        isError(res.json);
        expect(res.json.error.code).toBe('unsupported_function_type');
        expect(res.json.error.payload).toStrictEqual({ tools: [{ integration_id: 'notion', tool: 'sync_docs', type: 'sync' }] });
    });

    it('rejects a meta tool Nango does not ship', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token,
            body: { tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } }, meta_tools: { nango_teleport: true } }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('unknown_meta_tool');
        expect(res.json.error.payload).toStrictEqual({ meta_tools: ['nango_teleport'] });
    });

    it('rejects a body with no connection selector at all', async () => {
        const { token } = await seedTenant();

        const res = await api.fetch(endpoint, { method: 'POST', token, body: { tenant: { connections: {} } } });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_body');
    });
});
