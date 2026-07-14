import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { createControlPlaneMcpServer } from './controlPlaneServer.js';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetControlPlaneMcp, PostControlPlaneMcp } from '@nangohq/types';

export const postControlPlaneMcp = asyncWrapper<PostControlPlaneMcp>(async (req, res) => {
    const { account, environment } = res.locals;
    const server = createControlPlaneMcpServer(account, environment, res.locals['apiKeyScopes']);
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, req.body);
});

// We have to be explicit about not supporting SSE
export const getControlPlaneMcp = asyncWrapper<GetControlPlaneMcp>((_, res) => {
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
