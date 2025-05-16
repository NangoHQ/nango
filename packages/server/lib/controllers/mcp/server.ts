import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types';
import tracer from 'dd-trace';

import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { configService, getActionsByProviderConfigKey } from '@nangohq/shared';
import { Err, Ok, truncateJson } from '@nangohq/utils';

import { getOrchestrator } from '../../utils/utils.js';

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBSyncConfig, DBTeam, Result } from '@nangohq/types';
import type { Span } from 'dd-trace';
import type { JSONSchema7 } from 'json-schema';

export async function createMcpServerForConnection(
    account: DBTeam,
    environment: DBEnvironment,
    connection: DBConnectionDecrypted,
    providerConfigKey: string
): Promise<Result<Server>> {
    const server = new Server(
        {
            name: 'Nango MCP server',
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

    server.setRequestHandler(ListToolsRequestSchema, () => {
        return {
            tools: actions.flatMap((action) => {
                const tool = actionToTool(action);
                return tool ? [tool] : [];
            })
        };
    });

    server.setRequestHandler(CallToolRequestSchema, callToolRequestHandler(actions, account, environment, connection, providerConfig));

    return Ok(server);
}

async function getActionsForProvider(environment: DBEnvironment, providerConfig: Config): Promise<DBSyncConfig[]> {
    return getActionsByProviderConfigKey(environment.id, providerConfig.unique_key);
}

function actionToTool(action: DBSyncConfig): Tool | null {
    const inputSchema =
        action.input && action.models_json_schema?.definitions && action.models_json_schema?.definitions?.[action.input]
            ? (action.models_json_schema.definitions[action.input] as JSONSchema7)
            : ({ type: 'object' } as JSONSchema7);

    if (inputSchema.type !== 'object') {
        // Invalid input schema, skip this action
        return null;
    }

    const description = action.metadata.description || action.sync_name;

    return {
        name: action.sync_name,
        inputSchema: {
            type: 'object',
            properties: inputSchema.properties,
            required: inputSchema.required
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
        const active = tracer.scope().active();
        const span = tracer.startSpan('server.mcp.triggerAction', {
            childOf: active as Span
        });

        const { name, arguments: toolArguments } = request.params;

        const action = actions.find((action) => action.sync_name === name);

        if (!action) {
            span.finish();
            throw new Error(`Action ${name} not found`);
        }

        const input = toolArguments ?? {};

        span.setTag('nango.actionName', action.sync_name)
            .setTag('nango.connectionId', connection.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', providerConfig.unique_key);

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

        const actionResponse = await getOrchestrator().triggerAction({
            accountId: account.id,
            connection,
            actionName: action.sync_name,
            input,
            async: false,
            retryMax: 3,
            logCtx
        });

        if (actionResponse.isOk()) {
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
            throw new Error(actionResponse.error.message);
        }
    };
}
