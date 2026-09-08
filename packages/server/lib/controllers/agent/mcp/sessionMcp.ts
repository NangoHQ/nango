import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { createAgentSessionMcpServer } from './sessionServer.js';

import type { GetAgentSessionMcp, PostAgentSessionMcp } from '@nangohq/types';

export const postAgentSessionMcp = asyncWrapperWithEnvironment<PostAgentSessionMcp>(async (req, res) => {
    const { account, environment, agentSession: session } = res.locals;

    if (req.params.sessionId !== session.id) {
        res.status(404).send({ error: { code: 'session_not_found', message: `Agent session '${req.params.sessionId}' not found` } });
        return;
    }

    const server = createAgentSessionMcpServer({ account, environment, session }, req.body);
    const transport = new NodeStreamableHTTPServerTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
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
