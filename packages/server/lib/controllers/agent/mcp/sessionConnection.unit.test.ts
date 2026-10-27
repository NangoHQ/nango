import { afterEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import * as agentSessionService from '../../../services/agentSession.service.js';
import * as agentSessionMcpDiscoveryService from '../../../services/agentSessionMcpDiscovery.service.js';
import { hasPendingMcpServers, withMcpToolsDiscovered } from './sessionConnection.js';
import { buildSessionTools } from './sessionServer.js';

import type { McpServerDiscovery } from '../../../services/agentSessionMcpDiscovery.service.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';

const inputSchema = { type: 'object', properties: {} };

const TOOLSET: AgentSessionCompiledToolset = {
    'notion-mcp': {
        provider: 'notion-mcp',
        pinned: [],
        searchable: [],
        mcpServer: { status: 'pending', allow: '*', deny: ['delete_page'], pinnedNames: ['search'] }
    },
    'linear-mcp': { provider: 'linear-mcp', pinned: [], searchable: [], mcpServer: { status: 'pending', allow: '*', deny: [], pinnedNames: [] } }
};

const NOTION_CREATED_IN_SESSION = { integrationId: 'notion-mcp', provider: 'notion-mcp', connectionId: 'notion-new', internalConnectionId: 10, configId: 20 };

function session(resolvedConnections: AgentSessionResolvedConnections, compiledToolset: AgentSessionCompiledToolset = TOOLSET): AgentSession {
    return {
        id: 'session-1',
        environmentId: 42,
        accountId: 1,
        resolvedConnections,
        compiledToolset,
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: true, tags: {} } },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

function discover(current: AgentSession) {
    return withMcpToolsDiscovered({ account: { id: 1 } as DBTeam, environment: { id: 42 } as DBEnvironment, plan: null, session: current });
}

function listsNotion(discovery: McpServerDiscovery) {
    return vi.spyOn(agentSessionMcpDiscoveryService, 'discoverMcpTools').mockResolvedValue(new Map([['notion-mcp', discovery]]));
}

function storesWhatItIsGiven(base: AgentSessionCompiledToolset) {
    return vi
        .spyOn(agentSessionService, 'fillPendingMcpServers')
        .mockImplementation(async (_trx, { integrations }) => Promise.resolve(Ok({ ...base, ...integrations })));
}

describe('withMcpToolsDiscovered', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lists an MCP server the agent connected, and stores its tools', async () => {
        const discoverMcpTools = listsNotion({
            status: 'available',
            tools: [
                { name: 'search', inputSchema },
                { name: 'delete_page', inputSchema }
            ]
        });
        const fillPendingMcpServers = storesWhatItIsGiven(TOOLSET);

        const current = await discover(session({ 'notion-mcp': NOTION_CREATED_IN_SESSION }));

        expect(discoverMcpTools).toHaveBeenCalledWith(expect.objectContaining({ connections: [NOTION_CREATED_IN_SESSION] }));
        expect(current.compiledToolset['notion-mcp']).toEqual({
            provider: 'notion-mcp',
            pinned: [{ name: 'search', description: 'search', mcp: { inputSchema }, slug: 'notion-mcp__search' }],
            searchable: [],
            mcpServer: 'available'
        });
        expect(current.compiledToolset['linear-mcp']).toEqual(TOOLSET['linear-mcp']);
        expect(fillPendingMcpServers).toHaveBeenCalledWith(expect.anything(), {
            id: 'session-1',
            pending: ['notion-mcp', 'linear-mcp'],
            integrations: { 'notion-mcp': current.compiledToolset['notion-mcp'] }
        });
        expect(hasPendingMcpServers(current)).toBe(true);
    });

    it('keeps every name the session already gave out', async () => {
        const prefix = 'x'.repeat(30);
        const toolset: AgentSessionCompiledToolset = {
            'notion-mcp': {
                provider: 'notion-mcp',
                pinned: [],
                searchable: [{ name: `${prefix}_read`, description: 'read' }],
                mcpServer: { status: 'pending', allow: '*', deny: [], pinnedNames: [`${prefix}_delete`] }
            }
        };
        const before = session({ 'notion-mcp': NOTION_CREATED_IN_SESSION }, toolset);
        const namesBefore = [...buildSessionTools(before).callable].map(([name, tool]) => [name, tool.name] as const);
        listsNotion({ status: 'available', tools: [{ name: `${prefix}_delete`, inputSchema }] });
        storesWhatItIsGiven(toolset);

        const after = await discover(before);
        const callableAfter = buildSessionTools(after).callable;

        for (const [name, toolName] of namesBefore) {
            expect(callableAfter.get(name)?.name).toBe(toolName);
        }
        expect([...callableAfter.values()].map((tool) => tool.name)).toContain(`${prefix}_delete`);
    });

    it('serves what another request stored when it listed the server first', async () => {
        listsNotion({ status: 'available', tools: [{ name: 'search', inputSchema }] });
        const winner: AgentSessionCompiledToolset = {
            ...TOOLSET,
            'notion-mcp': { provider: 'notion-mcp', pinned: [], searchable: [], mcpServer: 'unavailable' }
        };
        vi.spyOn(agentSessionService, 'fillPendingMcpServers').mockResolvedValue(Ok(winner));

        const current = await discover(session({ 'notion-mcp': NOTION_CREATED_IN_SESSION }));

        expect(current.compiledToolset).toBe(winner);
    });

    it('does not list a server that is still not connected', async () => {
        const discoverMcpTools = vi.spyOn(agentSessionMcpDiscoveryService, 'discoverMcpTools');

        const current = session({});

        expect(await discover(current)).toBe(current);
        expect(discoverMcpTools).not.toHaveBeenCalled();
    });
});
