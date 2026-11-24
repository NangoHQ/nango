import tracer from 'dd-trace';

import db from '@nangohq/database';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { functionLookupService, inlineFunctionService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { trackAgentSessionToolCall } from '../../../../services/agentSessionAnalytics.service.js';
import { resolveSessionConnection } from '../../../../services/agentSessionConnections.service.js';
import { decodeResultId } from '../../../../services/agentSessionResults.service.js';
import { queryResultToolDefinition } from '../../../../services/agentSessionToolCatalog.service/index.js';
import { getOrchestrator } from '../../../../utils/utils.js';
import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';
import { invalidArgumentsOf, makeAgentSessionMcpTool } from '../sessionTool.js';
import { outputTooLargeError, queryRunErrorToMcp, resultNotFoundError } from './errors.js';

import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const logger = getLogger('Server.MCP.AgentSession.QueryResult');

// The orchestrator gives a synchronous function run 2 minutes.
const RUN_TIMEOUT_MS = 2 * 60 * 1000;

export const queryResultTool = makeAgentSessionMcpTool({
    ...queryResultToolDefinition,
    onInvalidArguments: ({ session }, { error }) => {
        trackAgentSessionToolCall({ metaTool: 'nango_query_result', session, errorCode: 'invalid_input', invalidArguments: invalidArgumentsOf(error) });
    },
    async handler({ args, account, environment, session }) {
        const track = (properties: { integrationId?: string; logOperationId?: string | undefined; errorCode?: string | undefined }) => {
            trackAgentSessionToolCall({ metaTool: 'nango_query_result', session, goal: args.goal, intent: args.intent, ...properties });
        };

        const maxLength = inlineFunctionService.maxInlineFunctionCodeLength;
        if (args.code.length > maxLength) {
            track({ errorCode: 'code_too_long' });
            return Err(
                new PublicMcpError(
                    `The code is ${args.code.length} characters, over the limit of ${maxLength}. Shorten it and call nango_query_result again.`,
                    {
                        code: 'code_too_long'
                    }
                )
            );
        }

        const ref = decodeResultId(args.result_id);
        const connection = ref ? await resolveSessionConnection({ session, integrationId: ref.integrationId }) : null;
        if (!ref || !connection) {
            track({ errorCode: 'result_not_found' });
            return Err(resultNotFoundError());
        }
        const { integrationId } = connection;

        return await tracer.trace<Promise<Result<unknown>>>('server.mcp.agentSession.queryResult', async (span: Span) => {
            span.setTag('nango.agentSessionId', session.id)
                .setTag('nango.accountId', account.id)
                .setTag('nango.environmentId', environment.id)
                .setTag('nango.providerConfigKey', integrationId);

            const created = await inlineFunctionService.create(db.knex, {
                environmentId: environment.id,
                agentSessionId: session.id,
                code: args.code,
                resultRecordId: ref.recordId
            });
            if (created.isErr()) {
                span.setTag('nango.error', created.error);
                logger.error('Failed to create the inline function for an agent session query', { error: created.error });
                track({ integrationId, errorCode: 'internal_error' });
                return Err(new InternalMcpError());
            }

            const logCtx = await logContextGetter.create(
                {
                    operation: { type: 'tool', action: 'call' },
                    expiresAt: new Date(Date.now() + RUN_TIMEOUT_MS).toISOString(),
                    actor: { kind: 'session', id: session.id }
                },
                {
                    account,
                    environment,
                    integration: { id: connection.configId, name: integrationId, provider: connection.provider },
                    connection: { id: connection.internalConnectionId, name: connection.connectionId },
                    syncConfig: { name: functionLookupService.INLINE_FUNCTION_NAME },
                    meta: { goal: args.goal, intent: args.intent }
                }
            );
            logCtx.attachSpan(new OtlpSpan(logCtx.operation));

            const run = await getOrchestrator().invokeFunction({
                environment,
                connection: {
                    id: connection.internalConnectionId,
                    connection_id: connection.connectionId,
                    provider_config_key: integrationId,
                    environment_id: environment.id
                },
                functionUuid: created.value.uuid,
                trigger: { kind: 'invoke', input: null, connection: { connectionId: connection.connectionId, integrationId } },
                async: false,
                retryMax: 0,
                maxConcurrency: 0,
                logCtx
            });

            if (run.isErr()) {
                span.setTag('nango.error', run.error);
                void logCtx.error(run.error.message, { error: run.error });
                void logCtx.failed();
                const error = queryRunErrorToMcp(run.error);
                track({ integrationId, logOperationId: logCtx.id, errorCode: error instanceof PublicMcpError ? error.code : 'internal_error' });
                return Err(error);
            }
            const output = 'data' in run.value ? run.value.data : null;
            const outputBytes = Buffer.byteLength(JSON.stringify(output ?? null), 'utf8');
            if (outputBytes > envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES) {
                const limit = `${Math.round(envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES / 1024)} KB`;
                void logCtx.error(`The code returned ${outputBytes} bytes, over the ${limit} limit`);
                void logCtx.failed();
                track({ integrationId, logOperationId: logCtx.id, errorCode: 'output_too_large' });
                return Err(outputTooLargeError(limit));
            }

            void logCtx.success();
            track({ integrationId, logOperationId: logCtx.id });
            return Ok(output);
        });
    }
});
