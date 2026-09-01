import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { resolveAuditAttribution } from '../../middleware/audit/index.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { createManagementMcpServer } from './managementServer.js';

import type { RequestLocalsWithEnvironment } from '../../utils/express.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetManagementMcp, PostManagementMcp } from '@nangohq/types';

export const postManagementMcp = asyncWrapperWithEnvironment<PostManagementMcp>(async (req, res) => {
    const { account, environment, plan } = res.locals;
    const context = {
        account,
        environment,
        plan,
        grantedScopes: res.locals.mcpOAuthScopes ?? res.locals.apiKeyPrincipal?.scopes,
        customerApiKeyId: getCustomerApiKeyId(res.locals),
        audit: resolveAuditAttribution(req, res.locals)
    };
    const server = createManagementMcpServer(context, req.body);
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, req.body);
});

// We have to be explicit about not supporting SSE
export const getManagementMcp = asyncWrapperWithEnvironment<GetManagementMcp>((_, res) => {
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

function getCustomerApiKeyId(locals: RequestLocalsWithEnvironment): number | undefined {
    return locals.apiKeyAuthSource === 'customer_key' ? locals.apiKeyId : undefined;
}
