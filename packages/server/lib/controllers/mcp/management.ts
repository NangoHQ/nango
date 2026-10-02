import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';

import { environmentService } from '@nangohq/shared';

import { principalFor } from '../../authz/principal.js';
import { resolveAuditAttribution } from '../../middleware/audit/index.js';
import { trackMcpServer } from '../../services/mcpAnalytics.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { createManagementMcpServer } from './managementServer.js';

import type { RequestLocals } from '../../utils/express.js';
import type { ManagementMcpEnvironment } from './managementTool.js';
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
    const handler = createMcpHandler(async ({ era }) => {
        const server = await createManagementMcpServer(authentication, req.body, era);
        trackMcpServer({
            server,
            mcpType: 'management',
            account,
            ...(authentication.type === 'oauth' ? { user: res.locals.user } : {}),
            authType: authentication.type,
            ...(authentication.type === 'apiKey' ? { environment: authentication.context.environment } : { environments: authentication.context.environments })
        });
        return server;
    });
    const nodeHandler = toNodeHandler({
        fetch: async (request, options) => await withTopLevelToolSecuritySchemesResponse(await handler.fetch(request, options))
    });

    try {
        await nodeHandler(req, res, req.body);
    } finally {
        await handler.close();
    }
});

async function withTopLevelToolSecuritySchemesResponse(response: Response): Promise<Response> {
    if (!response.headers.get('content-type')?.includes('application/json')) {
        return response;
    }

    const message = (await response.clone().json()) as unknown;
    const transformed = withTopLevelToolSecuritySchemes(message);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(transformed), { status: response.status, statusText: response.statusText, headers });
}

/**
 * @modelcontextprotocol/server currently emits only the compatibility mirror in
 * `_meta.securitySchemes`. OpenAI also expects the top-level tool descriptor field.
 */
export function withTopLevelToolSecuritySchemes(message: unknown): unknown {
    if (Array.isArray(message)) {
        return message.map(withTopLevelToolSecuritySchemes);
    }
    if (!isRecord(message) || !isRecord(message['result']) || !Array.isArray(message['result']['tools'])) {
        return message;
    }

    const tools = (message['result']['tools'] as unknown[]).map((tool) => {
        if (!isRecord(tool) || !isRecord(tool['_meta']) || !Array.isArray(tool['_meta']['securitySchemes'])) {
            return tool;
        }

        return { ...tool, securitySchemes: tool['_meta']['securitySchemes'] };
    });

    return { ...message, result: { ...message['result'], tools } };
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
