import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { createAgentSessionMcpServer } from './sessionServer.js';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetAgentSessionMcp, PostAgentSessionMcp } from '@nangohq/types';

export const postAgentSessionMcp = asyncWrapperWithEnvironment<PostAgentSessionMcp>(async (req, res) => {
    const { account, environment, agentSession: session } = res.locals;

    if (req.params.sessionId !== session.id) {
        res.status(404).send({ error: { code: 'session_not_found', message: `Agent session '${req.params.sessionId}' not found` } });
        return;
    }

    const server = createAgentSessionMcpServer({ account, environment, session });
    const transport = new StreamableHTTPServerTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    // Casting because 'exactOptionalPropertyTypes: true' says `?: string` is not equal to `string | undefined`
    await server.connect(transport as Transport);
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
