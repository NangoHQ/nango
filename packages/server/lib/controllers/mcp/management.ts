import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { resolveAuditAttribution } from '../../middleware/audit/index.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { createManagementMcpServer } from './managementServer.js';

import type { RequestLocals } from '../../utils/express.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetManagementMcp, PostManagementMcp } from '@nangohq/types';

export const postManagementMcp = asyncWrapper<PostManagementMcp>(async (req, res) => {
    const { account, plan } = res.locals;
    const baseContext = {
        account,
        plan,
        grantedScopes: res.locals.mcpOAuthScopes ?? res.locals.apiKeyPrincipal?.scopes,
        customerApiKeyId: getCustomerApiKeyId(res.locals),
        audit: resolveAuditAttribution(req, res.locals)
    };
    const context =
        res.locals.authType === 'mcpOAuth'
            ? { ...baseContext, user: res.locals.user, authorizedEnvironments: res.locals.mcpOAuthEnvironments ?? [] }
            : { ...baseContext, environment: requireEnvironment(res.locals) };
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
export const getManagementMcp = asyncWrapper<GetManagementMcp>((_, res) => {
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

function getCustomerApiKeyId(locals: RequestLocals): number | undefined {
    return locals.apiKeyAuthSource === 'customer_key' ? locals.apiKeyId : undefined;
}

function requireEnvironment(locals: RequestLocals) {
    if (!locals.environment) {
        throw new Error('Management MCP API-key authentication requires an environment');
    }
    return locals.environment;
}
