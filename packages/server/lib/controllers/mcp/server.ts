import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import tracer from 'dd-trace';

import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { configService, getActionsByProviderConfigKey } from '@nangohq/shared';
import { Err, Ok, nangoModelToJsonSchema, truncateJson } from '@nangohq/utils';

import { getOrchestrator } from '../../utils/utils.js';

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBSyncConfig, DBTeam, LegacySyncModelSchema, NangoModel, Result } from '@nangohq/types';
import type { Span } from 'dd-trace';

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

function isLegacyModelSchema(model_schema: NangoModel | LegacySyncModelSchema): model_schema is LegacySyncModelSchema {
    return model_schema.fields.some((f) => 'type' in f);
}

function actionToTool(action: DBSyncConfig): Tool | null {
    const inputModelName = action.input;
    const inputModel = action.model_schema?.find((m) => m.name === inputModelName);

    if (inputModel && isLegacyModelSchema(inputModel)) {
        // We don't support legacy model schemas for MCP. Redeploying the action should update the model schema.
        return null;
    }

    let inputSchema: Tool['inputSchema'] = { type: 'object' };

    if (inputModel) {
        const inputSchemaResult = nangoModelToJsonSchema(inputModel, action.model_schema as NangoModel[]);
        if (inputSchemaResult.isErr()) {
            return null;
        }

        inputSchema = inputSchemaResult.value as Tool['inputSchema'];
    }

    if (inputSchema.type !== 'object') {
        // Invalid input schema, skip this action
        return null;
    }

    return {
        name: action.sync_name,
        inputSchema: inputSchema,
        description: action.metadata.description || action.sync_name
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
            await logCtx.failed();
            throw new Error(actionResponse.error.message);
        }
    };
}
