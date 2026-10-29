import tracer from 'dd-trace';

import { configService, invokeFunction, NangoError, toolService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { executeAction } from '../../../services/action.service.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { actionExecutionErrorToMcp } from '../actions/errors.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { callToolArgumentsSchema, callToolOutputSchema } from './schema.js';

import type { ManagementMcpTool } from '../managementTool.js';
import type { CallToolOutput } from './schema.js';
import type { FunctionInvokeError } from '@nangohq/shared';

const logger = getLogger('Server.MCP.Tools');

function functionInvokeErrorToMcp(error: FunctionInvokeError): Error {
    const code = error.code;
    switch (code) {
        case 'connection_not_found':
        case 'function_not_found':
        case 'function_disabled':
        case 'invalid_invocation':
            return new PublicMcpError(error.message);
        case 'validation_error':
            return new PublicMcpError(error.errors.length > 0 ? `${error.message}: ${JSON.stringify(error.errors)}` : error.message);
        case 'function_failed': {
            const cause = error.cause;
            if (!(cause instanceof NangoError) || cause.type === 'function_failure') {
                logger.error('Failed to call tool function', { err: error });
            }
            return new PublicMcpError(error.message);
        }
        case 'server_error':
            logger.error('Failed to call tool function', { err: error });
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected FunctionInvokeError code while calling tool', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}

export const callToolsTool: ManagementMcpTool<CallToolOutput> = defineManagementMcpTool<typeof callToolArgumentsSchema, CallToolOutput>({
    name: 'tools_call',
    title: 'Call Tool',
    description:
        'Calls an enabled tool of an integration synchronously for a connection and returns its result in the data field. The MCP request may time out within 90 seconds without canceling execution. After a timeout, the tool cannot return the result or an execution ID; retrying starts another execution and may duplicate side effects.',
    inputSchema: callToolArgumentsSchema,
    outputSchema: callToolOutputSchema,
    requiredScopes: { every: ['environment:functions:invocations', 'environment:actions:execute'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    async handler({ args, account, environment }) {
        const notFound = () =>
            Err<CallToolOutput, PublicMcpError>(new PublicMcpError(`Tool '${args.name}' for integration '${args.integration_id}' was not found`));

        const integration = await configService.getProviderConfig(args.integration_id, environment.id);
        if (!integration) {
            return notFound();
        }

        const resolved = await toolService.resolveTool({ accountUuid: account.uuid, environmentId: environment.id, integration, name: args.name });
        if (resolved.isErr()) {
            logger.error('Failed to resolve tool', { err: resolved.error });
            return Err<CallToolOutput>(new InternalMcpError());
        }

        const tool = resolved.value;
        if (tool.kind === 'missing') {
            return notFound();
        }

        if (tool.kind === 'function') {
            const result = await invokeFunction({
                account,
                environment,
                connectionId: args.connection_id,
                functionUuid: tool.fn.config.uuid,
                input: args.input,
                request: { method: 'POST', path: '/mcp', headers: {}, query: {} },
                invocationType: 'wait',
                orchestrator: getOrchestrator()
            });
            if (result.isErr()) {
                return Err<CallToolOutput>(functionInvokeErrorToMcp(result.error));
            }
            const output = callToolOutputSchema.safeParse(result.value);
            if (!output.success) {
                logger.error('Invalid tool function response', { issues: output.error.issues });
                return Err<CallToolOutput>(new InternalMcpError());
            }
            return Ok(output.data);
        }

        return await tracer.trace('server.mcp.callTool.fallback', async (span) => {
            const execution = await executeAction({
                account,
                environment,
                connectionId: args.connection_id,
                providerConfigKey: integration.unique_key,
                actionName: args.name,
                input: args.input,
                isAsync: false,
                retryMax: 0,
                span
            });
            if (execution.result.isErr()) {
                return Err<CallToolOutput>(actionExecutionErrorToMcp(execution.result.error));
            }

            const output = callToolOutputSchema.safeParse(execution.result.value);
            if (!output.success) {
                logger.error('Orchestrator returned an invalid synchronous action response; expected a top-level data field containing a JSON value', {
                    issues: output.error.issues
                });
                return Err<CallToolOutput>(new InternalMcpError());
            }
            return Ok(output.data);
        });
    }
});
