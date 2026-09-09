import { Server } from '@modelcontextprotocol/server';
import tracer from 'dd-trace';

import { defaultOperationExpiration, logContextGetter, OtlpSpan } from '@nangohq/logs';
import { configService, getActionsByProviderConfigKey } from '@nangohq/shared';
import { Err, getLogger, metrics, Ok, truncateJson } from '@nangohq/utils';

import { envs } from '../../env.js';
import { getOrchestrator } from '../../utils/utils.js';
import { mcpToolError, safeFailureDetail } from './utils.js';

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/server';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBSyncConfig, DBTeam, Result } from '@nangohq/types';
import type { Span } from 'dd-trace';
import type { JSONSchema7 } from 'json-schema';

const logger = getLogger('Server.MCP.ConnectionTools');

type ConnectionToolErrorCode = 'tool_not_available' | 'tool_failed' | 'internal_error';

function connectionToolError(message: string, code: ConnectionToolErrorCode, integrationId: string): CallToolResult {
    return mcpToolError(message, { code, integrationId });
}

export async function createConnectionToolsMcpServer(
    account: DBTeam,
    environment: DBEnvironment,
    connection: DBConnectionDecrypted,
    providerConfigKey: string
): Promise<Result<Server>> {
    const server = new Server(
        {
            name: 'Nango Connection Tools MCP server',
            version: '1.0.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    const providerConfig = await configService.getProviderConfig(providerConfigKey, environment.id);

    if (!providerConfig) {
        return Err(new Error(`Provider config ${providerConfigKey} not found`));
    }

    const actions = await getActionsForProvider(environment, providerConfig);

    server.setRequestHandler('tools/list', () => {
        return {
            tools: actions.flatMap((action) => {
                if (!action.enabled) {
                    return [];
                }

                const tool = actionToTool(action);
                return tool ? [tool] : [];
            })
        };
    });

    server.setRequestHandler('tools/call', callToolRequestHandler(actions, account, environment, connection, providerConfig));

    return Ok(server);
}

async function getActionsForProvider(environment: DBEnvironment, providerConfig: Config): Promise<DBSyncConfig[]> {
    return getActionsByProviderConfigKey(environment.id, providerConfig.unique_key);
}

function actionToTool(action: DBSyncConfig): Tool | null {
    let inputSchema = action.input ? (action.models_json_schema?.definitions?.[action.input] as JSONSchema7 | undefined) : undefined;

    if (inputSchema && inputSchema.type === 'null') {
        inputSchema = undefined;
    }

    if (inputSchema && inputSchema.type !== 'object') {
        // Invalid input schema, skip this action
        return null;
    }

    const description = action.metadata.description || action.sync_name;

    return {
        name: action.sync_name,
        inputSchema: {
            type: 'object',
            properties: inputSchema?.properties as Tool['inputSchema']['properties'],
            required: inputSchema?.required,
            description: inputSchema?.description
        },
        description
    };
}

function callToolRequestHandler(
    actions: DBSyncConfig[],
    account: DBTeam,
    environment: DBEnvironment,
    connection: DBConnectionDecrypted,
    providerConfig: Config
): (request: CallToolRequest) => Promise<CallToolResult> {
    return async (request: CallToolRequest) => {
        metrics.increment(metrics.Types.ACTION_CALLED_BY_MCP_SERVER, 1, { accountId: account.id });

        const active = tracer.scope().active();
        const span = tracer.startSpan('server.mcp.triggerAction', {
            childOf: active as Span
        });

        const { name, arguments: toolArguments } = request.params;

        const action = actions.find((action) => action.sync_name === name);

        if (!action) {
            span.finish();
            return connectionToolError(
                `Tool '${name}' is not one of this connection's tools. Call one of the tools listed for this connection.`,
                'tool_not_available',
                providerConfig.unique_key
            );
        }

        span.setTag('nango.actionName', action.sync_name)
            .setTag('nango.connectionId', connection.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', providerConfig.unique_key);

        if (!action.enabled) {
            metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { mcp_type: 'legacy_connection_tools', outcome: 'error' });
            span.setTag('nango.error', 'disabled_action');
            span.finish();
            return connectionToolError(
                `Tool '${action.sync_name}' is not available on integration '${providerConfig.unique_key}'. Use another tool for the task, or tell the user it cannot be done.`,
                'tool_not_available',
                providerConfig.unique_key
            );
        }

        const input = toolArguments ?? {};

        const logCtx = await logContextGetter.create(
            { operation: { type: 'action', action: 'run' }, expiresAt: defaultOperationExpiration.action() },
            {
                account,
                environment,
                integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: action.id, name: action.sync_name },
                meta: truncateJson({ input })
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        let actionResponse;
        try {
            actionResponse = await getOrchestrator().triggerAction({
                accountId: account.id,
                connection,
                actionName: action.sync_name,
                input,
                async: false,
                retryMax: 3,
                maxConcurrency: envs.ACTION_ENVIRONMENT_MAX_CONCURRENCY,
                logCtx
            });
        } catch (err) {
            metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { mcp_type: 'legacy_connection_tools', outcome: 'error' });
            logger.error('Failed to run a connection tool', { err, actionName: action.sync_name });
            span.setTag('nango.error', err);
            span.finish();
            await logCtx.failed();
            return connectionToolError(
                `Tool '${action.sync_name}' could not be run. Trying once more is reasonable, and tell the user if it keeps failing.`,
                'internal_error',
                providerConfig.unique_key
            );
        }

        metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
            mcp_type: 'legacy_connection_tools',
            outcome: actionResponse.isOk() ? 'success' : 'error'
        });

        if (actionResponse.isOk()) {
            span.finish();

            if (!('data' in actionResponse.value)) {
                // Shouldn't happen with sync actions.
                return {
                    content: []
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(actionResponse.value.data, null, 2)
                    }
                ]
            };
        } else {
            span.setTag('nango.error', actionResponse.error);
            span.finish();
            await logCtx.failed();

            return connectionToolError(
                `Tool '${action.sync_name}' ran on integration '${providerConfig.unique_key}' and failed: ${safeFailureDetail(actionResponse.error)}. Read the failure before deciding whether to call it again with different input or to tell the user.`,
                'tool_failed',
                providerConfig.unique_key
            );
        }
    };
}
