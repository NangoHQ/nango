import { Server } from '@modelcontextprotocol/server';
import tracer from 'dd-trace';

import { configService, legacyFunctionService } from '@nangohq/shared';
import { Err, metrics, Ok } from '@nangohq/utils';

import { executeAction } from '../../services/action.service.js';
import { mcpToolError, safeFailureDetail } from './utils.js';

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/server';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam, ListedNangoActionFunction, Result } from '@nangohq/types';
import type { Span } from 'dd-trace';
import type { JSONSchema7 } from 'json-schema';

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

    const actionsResult = await legacyFunctionService.listActions({ environmentId: environment.id, providerConfigKey });
    if (actionsResult.isErr()) {
        return Err(actionsResult.error);
    }
    const actions = actionsResult.value;

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

function actionToTool(action: ListedNangoActionFunction): Tool | null {
    let inputSchema = action.input ? (action.json_schema?.definitions?.[action.input] as JSONSchema7 | undefined) : undefined;

    if (inputSchema && inputSchema.type === 'null') {
        inputSchema = undefined;
    }

    if (inputSchema && inputSchema.type !== 'object') {
        // Invalid input schema, skip this action
        return null;
    }

    const description = action.description || action.name;

    return {
        name: action.name,
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
    actions: ListedNangoActionFunction[],
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

        const action = actions.find((action) => action.name === name);

        if (!action) {
            span.finish();
            return connectionToolError(
                `Tool '${name}' is not one of this connection's tools. Call one of the tools listed for this connection.`,
                'tool_not_available',
                providerConfig.unique_key
            );
        }

        span.setTag('nango.actionName', name)
            .setTag('nango.connectionId', connection.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', providerConfig.unique_key);

        const input = toolArguments ?? {};
        const execution = await executeAction({
            account,
            environment,
            connectionId: connection.connection_id,
            providerConfigKey: providerConfig.unique_key,
            actionName: name,
            input,
            isAsync: false,
            retryMax: 3,
            span
        });
        const actionResponse = execution.result;
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
            switch (actionResponse.error.code) {
                case 'unknown_action':
                case 'disabled_action':
                case 'unknown_connection':
                case 'unknown_provider':
                    return connectionToolError(
                        `Tool '${name}' is not available on integration '${providerConfig.unique_key}'. Use another tool for the task, or tell the user it cannot be done.`,
                        'tool_not_available',
                        providerConfig.unique_key
                    );
                case 'action_failed': {
                    const detail = actionResponse.error.nangoError ? safeFailureDetail(actionResponse.error.nangoError) : actionResponse.error.message;
                    return connectionToolError(
                        `Tool '${name}' ran on integration '${providerConfig.unique_key}' and failed: ${detail}. Read the failure before deciding whether to call it again with different input or to tell the user.`,
                        'tool_failed',
                        providerConfig.unique_key
                    );
                }
                case 'internal_error':
                    return connectionToolError(
                        `Tool '${name}' could not be run. Trying once more is reasonable, and tell the user if it keeps failing.`,
                        'internal_error',
                        providerConfig.unique_key
                    );
            }
        }
    };
}
