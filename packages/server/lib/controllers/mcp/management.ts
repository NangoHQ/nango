import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';

import { environmentService } from '@nangohq/shared';

import { principalFor } from '../../authz/principal.js';
import { resolveAuditAttribution } from '../../middleware/audit/index.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { createManagementMcpServer } from './managementServer.js';

import type { RequestLocals } from '../../utils/express.js';
import type { ManagementMcpEnvironment } from './managementTool.js';
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/server';
import type { GetManagementMcp, PostManagementMcp } from '@nangohq/types';

export const postManagementMcp = asyncWrapper<PostManagementMcp>(async (req, res) => {
    const { account, plan } = res.locals;
    const authentication =
        res.locals.authType === 'mcpOAuth'
            ? ({
                  type: 'oauth',
                  context: {
                      account,
                      plan,
                      principal: requirePrincipal(res.locals),
                      environments: await loadManagementMcpEnvironments(account.id),
                      audit: resolveAuditAttribution(req, res.locals)
                  }
              } as const)
            : ({
                  type: 'apiKey',
                  context: {
                      account,
                      environment: requireApiKeyEnvironment(res.locals),
                      plan,
                      grantedScopes: res.locals['apiKeyPrincipal']?.scopes,
                      customerApiKeyId: getCustomerApiKeyId(res.locals),
                      audit: resolveAuditAttribution(req, res.locals)
                  }
              } as const);
    const server = await createManagementMcpServer(authentication, req.body);
    const transport = new ManagementMcpTransport();

    res.on('close', () => {
        void transport.close();
        void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

class ManagementMcpTransport extends NodeStreamableHTTPServerTransport {
    override send(message: JSONRPCMessage, options?: { relatedRequestId?: RequestId }): Promise<void> {
        return super.send(withTopLevelToolSecuritySchemes(message), options);
    }
}

/**
 * @modelcontextprotocol/server currently emits only the compatibility mirror in
 * `_meta.securitySchemes`. OpenAI also expects the top-level tool descriptor field.
 */
function withTopLevelToolSecuritySchemes(message: JSONRPCMessage): JSONRPCMessage {
    if (!('result' in message) || !isRecord(message.result) || !Array.isArray(message.result['tools'])) {
        return message;
    }

    let changed = false;
    const tools = (message.result['tools'] as unknown[]).map((tool) => {
        if (!isRecord(tool) || !isRecord(tool['_meta']) || !Array.isArray(tool['_meta']['securitySchemes'])) {
            return tool;
        }

        changed = true;
        return { ...tool, securitySchemes: tool['_meta']['securitySchemes'] };
    });

    if (!changed) {
        return message;
    }

    return { ...message, result: { ...message.result, tools } } as JSONRPCMessage;
}

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

function requirePrincipal(locals: RequestLocals) {
    const principal = principalFor(locals);
    if (!principal) {
        throw new Error('Management MCP OAuth authentication requires a principal');
    }
    return principal;
}

async function loadManagementMcpEnvironments(accountId: number): Promise<ManagementMcpEnvironment[]> {
    const environments = await environmentService.getEnvironmentsByAccountId(accountId);
    if (environments.isErr()) {
        throw environments.error;
    }

    return environments.value.map(({ id, uuid, name, is_production }) => ({ id, uuid, name, account_id: accountId, is_production }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
