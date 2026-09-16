import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';

import { resolveAuditAttribution } from '../../middleware/audit/index.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { createManagementMcpOAuthServer } from './managementOAuthServer.js';
import { createManagementMcpServer } from './managementServer.js';

import type { RequestLocals } from '../../utils/express.js';
import type { GetManagementMcp, PostManagementMcp } from '@nangohq/types';

export const postManagementMcp = asyncWrapper<PostManagementMcp>(async (req, res) => {
    const { account, plan } = res.locals;
    const server =
        res.locals.authType === 'mcpOAuth'
            ? createManagementMcpOAuthServer({ account, environments: res.locals.mcpOAuthEnvironments ?? [] })
            : createManagementMcpServer(
                  {
                      account,
                      environment: requireApiKeyEnvironment(res.locals),
                      plan,
                      grantedScopes: res.locals['apiKeyPrincipal']?.scopes,
                      customerApiKeyId: getCustomerApiKeyId(res.locals),
                      audit: resolveAuditAttribution(req, res.locals)
                  },
                  req.body
              );
    const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    await server.connect(transport);
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

function requireApiKeyEnvironment(locals: RequestLocals) {
    if (!locals.environment) {
        throw new Error('Management MCP API-key authentication requires an environment');
    }
    return locals.environment;
}
