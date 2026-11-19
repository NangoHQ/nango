import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { seeders } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import * as agentSessionService from '../../services/agentSession.service.js';
import * as agentSessionConnectionsService from '../../services/agentSessionConnections.service.js';
import * as agentSessionToolSearchService from '../../services/agentSessionToolSearch.service.js';
import * as remoteMcpService from '../../services/remoteMcp.service.js';
import { isError, isSuccess, runServer } from '../../utils/tests.js';

import type { AgentSessionCompiledToolset, AgentSessionMetaTools, GetAgentSessionTools } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
const endpoint = '/sessions/:sessionId/tools';
const metaTools: AgentSessionMetaTools = {
    nangoToolSearch: true,
    nangoExecute: true,
    nangoProxy: false,
    nangoCreateConnection: { enabled: false, tags: {} }
};

async function seedSession(compiledToolset: AgentSessionCompiledToolset = {}, meta = metaTools) {
    const { account, env } = await seeders.seedAccountEnvAndUser();
    const session = (
        await agentSessionService.insertAgentSession(db.knex, {
            accountId: account.id,
            environmentId: env.id,
            compiledToolset,
            resolvedConnections: {},
            metaTools: meta,
            expiresAt: new Date(Date.now() + 3600_000)
        })
    ).unwrap();
    const { token } = (await agentSessionService.createAgentSessionToken(db.knex, session)).unwrap();
    return { session, token, env };
}

function list(token: string, sessionId: string, cursor?: string) {
    return api.fetch(endpoint, { method: 'GET', token, params: { sessionId }, query: cursor === undefined ? {} : { cursor } });
}

const pinned = { name: 'send', description: 'Send a message' };
const toolset: AgentSessionCompiledToolset = {
    slack: { provider: 'slack', pinned: [pinned], searchable: [{ name: 'read', description: 'Read messages' }] }
};

describe('GET /sessions/:sessionId/tools', () => {
    beforeAll(async () => {
        api = await runServer();
        await keystore.migrate(db.knex);
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(() => api.server.close());

    it('requires a session token', async () => {
        const result = await api.fetch(endpoint, { method: 'GET', params: { sessionId: randomUUID() }, query: {} });
        expect(result.res.status).toBe(401);
    });

    it('rejects invalid tokens and mismatched session IDs', async () => {
        const { session, token } = await seedSession();
        expect((await list('invalid', session.id)).res.status).toBe(401);
        const result = await list(token, randomUUID());
        expect(result.res.status).toBe(404);
        isError(result.json);
        expect(result.json.error.code).toBe('session_not_found');
    });

    it.each(['expired', 'terminated'])('rejects a %s session', async (state) => {
        const { session, token } = await seedSession();
        await db
            .knex('agent_sessions')
            .where({ id: session.id })
            .update(state === 'expired' ? { expires_at: new Date(Date.now() - 1000) } : { ended_at: new Date(), ended_reason: 'terminated' });
        expect((await list(token, session.id)).res.status).toBe(401);
    });

    it.each([
        '',
        'bad!',
        Buffer.from('0'.repeat(192)).toString('base64url'),
        Buffer.from('-1').toString('base64url'),
        Buffer.from('1.5').toString('base64url'),
        Buffer.from('9007199254740992').toString('base64url')
    ])('rejects invalid cursor %s', async (cursor) => {
        const { session, token } = await seedSession();
        const result = await list(token, session.id, cursor);
        expect(result.res.status).toBe(400);
        isError(result.json);
        expect(result.json.error.code).toBe('invalid_query_params');
    });

    it('validates the session ID and rejects unknown query parameters', async () => {
        const { session, token } = await seedSession();
        const invalidId = await list(token, 'not-a-uuid');
        isError(invalidId.json);
        expect(invalidId.res.status).toBe(400);
        expect(invalidId.json.error.code).toBe('invalid_uri_params');
        const response = await fetch(`${api.url}/sessions/${session.id}/tools?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(400);
    });

    it('matches MCP metadata while omitting execution capabilities and searchable tools', async () => {
        const { session, token } = await seedSession(toolset);
        const rest = await list(token, session.id);
        expect(rest.res.status).toBe(200);
        isSuccess(rest.json);
        expect(rest.json.tools.map((tool) => tool.name)).toEqual(['nango_tool_search', 'nango_execute', 'slack__send']);
        const response = await fetch(`${api.url}/session/${session.id}/mcp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        });
        expect(response.status).toBe(200);
        const text = await response.text();
        const payload =
            text.startsWith('event:') || text.startsWith('data:')
                ? text
                      .split('\n')
                      .filter((line) => line.startsWith('data:'))
                      .map((line) => line.slice(5).trim())
                      .join('\n')
                : text;
        const mcp = JSON.parse(payload) as { result: { tools: (GetAgentSessionTools['Success']['tools'][number] & { execution?: unknown })[] } };
        expect(rest.json.tools).toEqual(mcp.result.tools.map(({ execution: _execution, ...tool }) => tool));
        expect(rest.json).not.toHaveProperty('next_cursor');
        expect(rest.json.tools[0]).toHaveProperty('outputSchema');
        expect(rest.json.tools[1]).not.toHaveProperty('outputSchema');
        expect(rest.json.tools[2]).not.toHaveProperty('outputSchema');
    });

    it('paginates before schema enrichment and wraps action input schemas', async () => {
        const actions = Array.from({ length: 51 }, (_, i) => ({ name: `action_${i}`, description: `Action ${i}` }));
        const { session, token, env } = await seedSession({ slack: { provider: 'slack', pinned: actions, searchable: [] } });
        const lookup = vi
            .spyOn(agentSessionToolSearchService, 'findActionInputs')
            .mockResolvedValue(
                new Map([
                    [
                        'slack',
                        new Map([['action_0', { kind: 'schema', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }]])
                    ]
                ])
            );
        const first = await list(token, session.id);
        isSuccess(first.json);
        expect(first.json.tools).toHaveLength(50);
        expect(first.json.next_cursor).toBeDefined();
        expect(lookup).toHaveBeenLastCalledWith({ environmentId: env.id, actions: actions.slice(0, 48).map(({ name }) => ({ integrationId: 'slack', name })) });
        expect(first.json.tools[2]?.inputSchema).toMatchObject({ properties: { input: { properties: { title: { type: 'string' } } }, goal: {}, intent: {} } });
        const second = await list(token, session.id, first.json.next_cursor);
        isSuccess(second.json);
        expect(second.json.tools.map((tool) => tool.name)).toEqual(['slack__action_48', 'slack__action_49', 'slack__action_50']);
        expect(second.json).not.toHaveProperty('next_cursor');
        expect(lookup).toHaveBeenLastCalledWith({ environmentId: env.id, actions: actions.slice(48).map(({ name }) => ({ integrationId: 'slack', name })) });
        const beyond = await list(token, session.id, Buffer.from('1000').toString('base64url'));
        expect(beyond.json).toEqual({ tools: [] });
    });

    it('returns an empty listing when no tools are enabled or pinned', async () => {
        const { session, token } = await seedSession({}, { ...metaTools, nangoToolSearch: false, nangoExecute: false });
        expect((await list(token, session.id)).json).toEqual({ tools: [] });
    });

    it('keeps the permissive schema when action lookup fails', async () => {
        const { session, token } = await seedSession(toolset);
        const before = await list(token, session.id);
        vi.spyOn(agentSessionToolSearchService, 'findActionInputs').mockRejectedValue(new Error('lookup failed'));
        const after = await list(token, session.id);
        expect(after.res.status).toBe(200);
        expect(after.json).toEqual(before.json);
    });

    it('discovers and persists tools from a newly connected MCP integration', async () => {
        const { session, token, env } = await seedSession(
            {
                'notion-mcp': {
                    provider: 'notion-mcp',
                    pinned: [],
                    searchable: [],
                    mcpServer: { status: 'pending', allow: '*', deny: [], pinnedNames: ['search'] }
                }
            },
            { ...metaTools, nangoCreateConnection: { enabled: true, tags: {} } }
        );
        await seeders.createConfigSeed(env, 'notion-mcp', 'notion-mcp');
        await seeders.createConnectionSeed({
            env,
            provider: 'notion-mcp',
            connectionId: 'new-notion',
            tags: { [agentSessionConnectionsService.AGENT_SESSION_TAG_KEY]: session.id }
        });
        const remote = vi
            .spyOn(remoteMcpService, 'withRemoteMcpSession')
            .mockResolvedValue({ logOperationId: undefined, result: Ok([{ name: 'search', inputSchema: { type: 'object', properties: {} } }]) });
        const result = await list(token, session.id);
        isSuccess(result.json);
        expect(result.json.tools).toContainEqual(
            expect.objectContaining({ name: 'notion-mcp__search', _meta: { 'nango/integration': 'notion-mcp', 'nango/tool': 'search' } })
        );
        expect((await list(token, session.id)).json).toEqual(result.json);
        expect(remote).toHaveBeenCalledTimes(1);
    });

    it('falls back to the original session when preparation fails', async () => {
        const { session, token } = await seedSession({
            'notion-mcp': { provider: 'notion-mcp', pinned: [], searchable: [], mcpServer: { status: 'pending', allow: '*', deny: [], pinnedNames: [] } }
        });
        vi.spyOn(agentSessionConnectionsService, 'withConnectionsCreatedInSession').mockRejectedValue(new Error('preparation failed'));
        const result = await list(token, session.id);
        expect(result.res.status).toBe(200);
        isSuccess(result.json);
        expect(result.json.tools.map((tool) => tool.name)).toEqual(['nango_tool_search', 'nango_execute']);
    });
});
