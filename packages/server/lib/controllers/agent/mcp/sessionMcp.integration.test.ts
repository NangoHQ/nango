import { randomUUID } from 'node:crypto';
import { request } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { customerKeyService, seeders } from '@nangohq/shared';

import { runServer } from '../../../utils/tests.js';

import type { DBEnvironment, DBSyncConfig, DBTeam, IntegrationConfig, PostAgentSessionsBody } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

async function mcpFetch({
    token,
    path,
    method,
    body
}: {
    token: string;
    path: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
}): Promise<{ status: number; json: any }> {
    const url = new URL(path, api.url);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    if (body) {
        headers['Accept'] = 'application/json, text/event-stream';
        headers['content-type'] = 'application/json';
    }

    return await new Promise((resolve, reject) => {
        const req = request({ hostname: url.hostname, port: url.port, path: url.pathname, method, headers }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode ?? 0, json: parseMcpResponse(data) });
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

function parseMcpResponse(data: string): any {
    const trimmed = data.trim();
    if (!trimmed) {
        return {};
    }
    if (!trimmed.startsWith('event:') && !trimmed.startsWith('data:')) {
        return JSON.parse(trimmed);
    }

    for (const event of trimmed.split(/\r?\n\r?\n/)) {
        const payload = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trimStart())
            .join('\n');

        if (payload) {
            return JSON.parse(payload);
        }
    }

    throw new Error('MCP SSE response did not contain a data payload');
}

async function insertAction({ environmentId, integration, name }: { environmentId: number; integration: IntegrationConfig; name: string }): Promise<void> {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: integration.id!,
        sync_name: name,
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: [],
        metadata: { description: `${name} description` },
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
}

/**
 * notion has a pinned tool and a searchable one, slack has one pinned tool. Both are on the same
 * tenant, so one session covers them.
 */
async function seedTenant(): Promise<{ account: DBTeam; env: DBEnvironment; apiKey: string }> {
    const seed = await seeders.seedAccountEnvAndUser();
    const key = (
        await customerKeyService.createApiKey(db.knex, {
            accountId: seed.account.id,
            environmentId: seed.env.id,
            displayName: `test-${randomUUID()}`,
            scopes: ['environment:agent_sessions:write']
        })
    ).unwrap();

    const notion = await seeders.createConfigSeed(seed.env, 'notion', 'notion');
    const slack = await seeders.createConfigSeed(seed.env, 'slack', 'slack');

    await insertAction({ environmentId: seed.env.id, integration: notion, name: 'read_doc' });
    await insertAction({ environmentId: seed.env.id, integration: notion, name: 'upsert_doc' });
    await insertAction({ environmentId: seed.env.id, integration: slack, name: 'send_message' });

    await seeders.createConnectionSeed({ env: seed.env, provider: 'notion', connectionId: 'notion-acme', tags: { tenant: 'acme' } });
    await seeders.createConnectionSeed({ env: seed.env, provider: 'slack', connectionId: 'slack-acme', tags: { tenant: 'acme' } });

    return { account: seed.account, env: seed.env, apiKey: key.secret };
}

async function createSession(apiKey: string, body: Partial<PostAgentSessionsBody> = {}): Promise<{ sessionId: string; token: string; mcpPath: string }> {
    const res = await api.fetch('/sessions', {
        method: 'POST',
        token: apiKey,
        body: {
            tenant: { connections: { any: [{ tags: { tenant: 'acme' } }] } },
            pinned_tools: { notion: ['read_doc'], slack: ['send_message'] },
            ...body
        } as PostAgentSessionsBody
    });

    if ('error' in res.json) {
        throw new Error(`Failed to create agent session: ${JSON.stringify(res.json.error)}`);
    }

    return { sessionId: res.json.data.session_id, token: res.json.data.session_token, mcpPath: new URL(res.json.data.mcp_url).pathname };
}

async function disableAction({ environmentId, name }: { environmentId: number; name: string }): Promise<void> {
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').where({ environment_id: environmentId, sync_name: name }).update({ enabled: false });
}

async function callTool({ token, mcpPath, name, args }: { token: string; mcpPath: string; name: string; args: Record<string, unknown> }) {
    return await mcpFetch({
        token,
        path: mcpPath,
        method: 'POST',
        body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
    });
}

async function listTools({ token, mcpPath, cursor }: { token: string; mcpPath: string; cursor?: string }) {
    return await mcpFetch({
        token,
        path: mcpPath,
        method: 'POST',
        body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: cursor ? { cursor } : {} }
    });
}

describe('/session/:sessionId/mcp', () => {
    beforeAll(async () => {
        api = await runServer();
        await keystore.migrate(db.knex);
    });

    afterAll(() => {
        api.server.close();
    });

    it('rejects a request without a session token', async () => {
        const { apiKey } = await seedTenant();
        const { mcpPath } = await createSession(apiKey);

        const res = await mcpFetch({ token: '', path: mcpPath, method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } });

        expect(res.status).toBe(401);
    });

    it('rejects the environment api key, which is not a session token', async () => {
        const { apiKey } = await seedTenant();
        const { mcpPath } = await createSession(apiKey);

        const res = await listTools({ token: apiKey, mcpPath });

        expect(res.status).toBe(401);
    });

    it('rejects a session token pointed at another session url', async () => {
        const { apiKey } = await seedTenant();
        const one = await createSession(apiKey);
        const two = await createSession(apiKey);

        const res = await listTools({ token: one.token, mcpPath: two.mcpPath });

        expect(res.status).toBe(404);
        expect(res.json.error.code).toBe('session_not_found');
    });

    it('lists the meta tools and the pinned tools, and no searchable tool', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await listTools({ token, mcpPath });

        expect(res.status).toBe(200);
        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).toStrictEqual([
            'nango_tool_search',
            'nango_execute',
            'notion__read_doc',
            'slack__send_message'
        ]);
        expect(res.json.result.nextCursor).toBeUndefined();
    });

    it('names the integration and the unqualified tool in _meta', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await listTools({ token, mcpPath });
        const pinned = res.json.result.tools.find((tool: { name: string }) => tool.name === 'notion__read_doc');

        expect(pinned._meta).toStrictEqual({ 'nango/integration': 'notion', 'nango/tool': 'read_doc' });
    });

    it('omits a meta tool the session turned off', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey, { meta_tools: { nango_tool_search: false } });

        const res = await listTools({ token, mcpPath });

        expect(res.json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain('nango_tool_search');
    });

    it('rejects a cursor it did not mint', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await listTools({ token, mcpPath, cursor: 'not-a-cursor' });

        expect(res.json.error.message).toContain('Invalid cursor');
    });

    it('refuses an integration the session does not have', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await callTool({ token, mcpPath, name: 'nango_execute', args: { integration: 'zendesk', tool: 'get_ticket' } });

        expect(res.json.result.isError).toBe(true);
        expect(res.json.result.content[0].text).toBe("Integration 'zendesk' is not one of this session's integrations.");
    });

    it('refuses a tool that is not in the session toolset', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await callTool({ token, mcpPath, name: 'nango_execute', args: { integration: 'notion', tool: 'delete_doc' } });

        expect(res.json.result.content[0].text).toBe("Tool 'delete_doc' is not in this session's toolset for integration 'notion'.");
    });

    it('rejects arguments that name no tool', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await callTool({ token, mcpPath, name: 'nango_execute', args: { integration: 'notion' } });

        expect(res.json.result.isError).toBe(true);
        expect(res.json.result.content[0].text).toContain('Invalid nango_execute arguments');
    });

    /**
     * The session compiled its toolset when it was created, so disabling the action afterwards is
     * what a tool that reaches execution and finds the environment changed underneath it looks like.
     * It is also the furthest these tests can follow a call without an orchestrator.
     */
    it('runs a searchable tool, which is callable without being listed', async () => {
        const { apiKey, env } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);
        await disableAction({ environmentId: env.id, name: 'upsert_doc' });

        const res = await callTool({ token, mcpPath, name: 'nango_execute', args: { integration: 'notion', tool: 'upsert_doc' } });

        expect(res.json.result.content[0].text).toBe("Tool 'upsert_doc' is disabled on integration 'notion'.");
    });

    it('runs a pinned tool called by its own name', async () => {
        const { apiKey, env } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);
        await disableAction({ environmentId: env.id, name: 'read_doc' });

        const res = await callTool({ token, mcpPath, name: 'notion__read_doc', args: { id: '1' } });

        expect(res.json.result.content[0].text).toBe("Tool 'read_doc' is disabled on integration 'notion'.");
    });

    it('rejects a call to a meta tool the session turned off, and not the same way as one it kept', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey, { meta_tools: { nango_tool_search: false } });

        const call = async (name: string) =>
            await mcpFetch({
                token,
                path: mcpPath,
                method: 'POST',
                body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }
            });

        // Both come back as errors, so the assertion is on which error: a turned-off tool is
        // refused by the SDK before any handler runs, one the session kept reaches ours.
        const off = await call('nango_tool_search');
        expect(off.json.result.isError).toBe(true);
        expect(off.json.result.content[0].text).toContain('Tool nango_tool_search disabled');

        const on = await call('nango_execute');
        expect(on.json.result.isError).toBe(true);
        expect(on.json.result.content[0].text).toContain('Invalid nango_execute arguments');
    });

    it('does not support SSE on GET', async () => {
        const { apiKey } = await seedTenant();
        const { token, mcpPath } = await createSession(apiKey);

        const res = await mcpFetch({ token, path: mcpPath, method: 'GET' });

        expect(res.status).toBe(405);
        expect(res.json.error.message).toBe('Method not allowed.');
    });
});
