import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';

import { report } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { hasPendingMcpServers, withConnectionsCreatedInSession, withMcpToolsDiscovered } from './sessionConnection.js';
import { createAgentSessionMcpServer } from './sessionServer.js';

import type { GetAgentSessionMcp, PostAgentSessionMcp } from '@nangohq/types';

/** The requests whose result carries the server instructions: initialize on 2025-era clients, server/discover on 2026-07-28. */
const INSTRUCTIONS_METHODS = new Set(['initialize', 'server/discover']);

export const postAgentSessionMcp = asyncWrapperWithEnvironment<PostAgentSessionMcp>(async (req, res) => {
    const { account, environment, plan, agentSession } = res.locals;

    if (req.params.sessionId !== agentSession.id) {
        res.status(404).send({ error: { code: 'session_not_found', message: `Agent session '${req.params.sessionId}' not found` } });
        return;
    }

    // The instructions say what is connected. Past that, only an MCP server the agent may have
    // connected since makes the lookup worth it, because it brings tools of its own.
    const session =
        isInstructionsRequest(req.body) || hasPendingMcpServers(agentSession)
            ? await withConnectionsCreatedInSession(agentSession)
                  .then(async (current) => await withMcpToolsDiscovered({ account, environment, plan, session: current }))
                  .catch((err: unknown) => {
                      report(err);
                      return agentSession;
                  })
            : agentSession;
    const handler = createMcpHandler(({ era }) => createAgentSessionMcpServer({ account, environment, plan, session }, req.body, era));

    try {
        await toNodeHandler(handler)(req, res, req.body);
    } finally {
        await handler.close();
    }
});

// We have to be explicit about not supporting SSE
export const getAgentSessionMcp = asyncWrapperWithEnvironment<GetAgentSessionMcp>((_, res) => {
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});

function isInstructionsRequest(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'method' in body && typeof body.method === 'string' && INSTRUCTIONS_METHODS.has(body.method);
}
