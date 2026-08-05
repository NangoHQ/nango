import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { contextFromRequest, resolveActor } from '../../middleware/audit.middleware.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { auditDeniedControlPlaneMcpCalls, createControlPlaneMcpServer } from './controlPlaneServer.js';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetControlPlaneMcp, PostControlPlaneMcp } from '@nangohq/types';

export const postControlPlaneMcp = asyncWrapper<PostControlPlaneMcp>(async (req, res) => {
    const { account, environment } = res.locals;
    const context = {
        account,
        environment,
        grantedScopes: res.locals['apiKeyScopes'],
        auditContext: {
            actor: resolveActor(res.locals),
            context: contextFromRequest(req)
        }
    };
    auditDeniedControlPlaneMcpCalls(req.body, context);
    const server = createControlPlaneMcpServer(context);
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
