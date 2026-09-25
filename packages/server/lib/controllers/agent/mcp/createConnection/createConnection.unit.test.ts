import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as agentSessionService from '../../../../services/agentSession.service.js';
import * as agentSessionConnectionsService from '../../../../services/agentSessionConnections.service.js';
import * as connectSessionService from '../../../../services/connectSession.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { buildSessionTools } from '../sessionServer.js';
import { createConnectionTool } from './createConnection.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type {
    AgentSession,
    AgentSessionCompiledToolset,
    AgentSessionCreateConnectionConfig,
    AgentSessionResolvedConnections,
    DBEnvironment,
    DBTeam
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const TOOLSET: AgentSessionCompiledToolset = {
    notion: { provider: 'notion', pinned: [{ name: 'read_doc', description: 'read a doc' }], searchable: [] },
    // In the toolset with no connection resolved for it, which is the only thing worth connecting.
    slack: { provider: 'slack', pinned: [], searchable: [] }
};

const CONNECTIONS: AgentSessionResolvedConnections = {
    notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 10, configId: 20 }
};

const CONNECT_SESSION = { token: 'nango_connect_session_abc', connectLink: 'https://connect.nango.dev/abc', expiresAt: new Date('2026-09-22T10:00:00.000Z') };

function context(createConnection: AgentSessionCreateConnectionConfig = { enabled: true, tags: {} }): AgentSessionMcpContext {
    const session: AgentSession = {
        id: 'session-1',
        environmentId: 42,
        accountId: 1,
        resolvedConnections: CONNECTIONS,
        compiledToolset: TOOLSET,
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: createConnection },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return {
        account: { id: 1 } as DBTeam,
        environment: { id: 42, name: 'dev' } as DBEnvironment,
        plan: null,
        session,
        callable: buildSessionTools(session).callable
    };
}

async function callCreateConnection(args: Record<string, unknown>, createConnection?: AgentSessionCreateConnectionConfig) {
    return await createConnectionTool.handler(args, context(createConnection));
}

function errorOf(result: Result<unknown>): Error {
    if (result.isOk()) {
        expect.fail(`Expected an error, got ${JSON.stringify(result.value)}`);
    }
    return result.error;
}

function codeOf(result: Result<unknown>): string | undefined {
    const error = errorOf(result);
    return error instanceof PublicMcpError ? error.code : undefined;
}

describe('createConnectionTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is off unless the session enabled it', () => {
        expect(createConnectionTool.isEnabled(context({ enabled: false, tags: {} }).session.metaTools)).toBe(false);
        expect(createConnectionTool.isEnabled(context({ enabled: true, tags: {} }).session.metaTools)).toBe(true);
    });

    it('returns a connect link for an integration the session has no connection for', async () => {
        const createConnectSession = vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(Ok(CONNECT_SESSION));
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue(null);

        const result = await callCreateConnection({ integration: 'slack' });

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toMatchObject({
            integration: 'slack',
            provider: 'slack',
            connect_url: 'https://connect.nango.dev/abc',
            expires_at: '2026-09-22T10:00:00.000Z'
        });
        expect(createConnectSession).toHaveBeenCalledWith(expect.objectContaining({ allowedIntegrations: ['slack'] }));
    });

    it('tags the connect session with the agent session, so the connection can be found again', async () => {
        const createConnectSession = vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(Ok(CONNECT_SESSION));
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue(null);

        await callCreateConnection({ integration: 'slack' });

        expect(createConnectSession).toHaveBeenCalledWith(expect.objectContaining({ tags: { 'nango/agent_session': 'session-1' } }));
    });

    it('stamps the configured tags alongside the reserved one', async () => {
        const createConnectSession = vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(Ok(CONNECT_SESSION));
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue(null);

        await callCreateConnection({ integration: 'slack' }, { enabled: true, tags: { enduser: '74' } });

        expect(createConnectSession).toHaveBeenCalledWith(expect.objectContaining({ tags: { enduser: '74', 'nango/agent_session': 'session-1' } }));
    });

    it('does not let a configured tag overwrite the reserved one', async () => {
        const createConnectSession = vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(Ok(CONNECT_SESSION));
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue(null);

        await callCreateConnection({ integration: 'slack' }, { enabled: true, tags: { 'nango/agent_session': 'someone-elses-session' } });

        expect(createConnectSession).toHaveBeenCalledWith(expect.objectContaining({ tags: { 'nango/agent_session': 'session-1' } }));
    });

    it('refuses an integration outside the session toolset', async () => {
        const result = await callCreateConnection({ integration: 'github' });

        expect(codeOf(result)).toBe('unknown_integration');
        expect(errorOf(result).message).toContain("Integration 'github' is not one of this session's integrations");
    });

    it('refuses an integration the session already resolved a connection for', async () => {
        const result = await callCreateConnection({ integration: 'notion' });

        expect(codeOf(result)).toBe('already_connected');
    });

    it('refuses an integration the agent already connected during the session', async () => {
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue({
            integrationId: 'slack',
            provider: 'slack',
            connectionId: 'slack-new',
            internalConnectionId: 12,
            configId: 22
        });
        vi.spyOn(agentSessionService, 'fillResolvedConnection').mockResolvedValue(
            Err(new agentSessionService.AgentSessionError({ code: 'not_found', message: 'ignored' }))
        );

        const result = await callCreateConnection({ integration: 'slack' });

        expect(codeOf(result)).toBe('already_connected');
    });

    it('tells the agent to retry when the connect link could not be created', async () => {
        vi.spyOn(agentSessionConnectionsService, 'findConnectionCreatedForSession').mockResolvedValue(null);
        vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(
            Err(new connectSessionService.CreateConnectSessionError({ code: 'session_creation_failed', message: 'nope' }))
        );

        const result = await callCreateConnection({ integration: 'slack' });

        expect(codeOf(result)).toBe('connect_link_failed');
        expect(errorOf(result).message).toContain('Trying once more is reasonable');
    });

    it('rejects a missing integration argument', async () => {
        const result = await callCreateConnection({});

        expect(codeOf(result)).toBe('invalid_input');
    });
});
