import { afterEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import * as agentSessionService from '../../../services/agentSession.service.js';
import * as agentSessionMcpDiscoveryService from '../../../services/agentSessionMcpDiscovery.service.js';
import { hasPendingMcpServers, withMcpToolsDiscovered } from './sessionConnection.js';

import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';

const inputSchema = { type: 'object', properties: {} };

const TOOLSET: AgentSessionCompiledToolset = {
    'notion-mcp': { provider: 'notion-mcp', pinned: [], searchable: [], pendingMcpServer: { allow: '*', deny: ['delete_page'], pinned: ['search'] } },
    'linear-mcp': { provider: 'linear-mcp', pinned: [], searchable: [], pendingMcpServer: { allow: '*', deny: [], pinned: [] } }
};

const NOTION_CREATED_IN_SESSION = { integrationId: 'notion-mcp', provider: 'notion-mcp', connectionId: 'notion-new', internalConnectionId: 10, configId: 20 };

function session(resolvedConnections: AgentSessionResolvedConnections): AgentSession {
    return {
        id: 'session-1',
        environmentId: 42,
        accountId: 1,
        resolvedConnections,
        compiledToolset: TOOLSET,
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

describe('withMcpToolsDiscovered', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lists an MCP server the agent connected, and stores its tools', async () => {
        const discoverMcpTools = vi.spyOn(agentSessionMcpDiscoveryService, 'discoverMcpTools').mockResolvedValue(
            new Map([
                [
                    'notion-mcp',
                    {
                        status: 'available',
                        tools: [
                            { name: 'search', inputSchema },
                            { name: 'delete_page', inputSchema }
                        ]
                    }
                ]
            ])
        );
        const fillPendingMcpServer = vi.spyOn(agentSessionService, 'fillPendingMcpServer').mockResolvedValue(Ok(undefined));

        const current = await discover(session({ 'notion-mcp': NOTION_CREATED_IN_SESSION }));

        expect(discoverMcpTools).toHaveBeenCalledWith(expect.objectContaining({ connections: [NOTION_CREATED_IN_SESSION] }));
        expect(current.compiledToolset['notion-mcp']).toEqual({
            provider: 'notion-mcp',
            pinned: [{ name: 'search', description: 'search', mcp: { inputSchema } }],
            searchable: [],
            mcpServer: 'available'
        });
        expect(current.compiledToolset['linear-mcp']).toBe(TOOLSET['linear-mcp']);
        expect(fillPendingMcpServer).toHaveBeenCalledWith(expect.anything(), {
            id: 'session-1',
            integrationId: 'notion-mcp',
            integration: current.compiledToolset['notion-mcp']
        });
        expect(hasPendingMcpServers(current)).toBe(true);
    });

    it('does not list a server that is still not connected', async () => {
        const discoverMcpTools = vi.spyOn(agentSessionMcpDiscoveryService, 'discoverMcpTools');

        const current = session({});

        expect(await discover(current)).toBe(current);
        expect(discoverMcpTools).not.toHaveBeenCalled();
    });
});
