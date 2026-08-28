import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

import { executeAction } from '../../../services/action.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { actionExecutionErrorToMcp } from './errors.js';
import { triggerActionArgumentsSchema, triggerActionOutputSchema } from './schema.js';

import type { TriggerActionOutput } from './schema.js';

export const triggerActionTool = defineManagementMcpTool<typeof triggerActionArgumentsSchema, TriggerActionOutput>({
    name: 'actions_trigger',
    description:
        'Trigger an action synchronously for a connection and return its result. Expect the MCP request to time out within 90 seconds, but this does not cancel the action, which may continue running for up to 15 minutes. If the request times out, this tool cannot return the result or an action ID; retrying will execute the action again.',
    inputSchema: triggerActionArgumentsSchema,
    outputSchema: triggerActionOutputSchema,
    requiredScopes: { every: ['environment:actions:execute'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    async handler({ args, account, environment }) {
        return await tracer.trace('server.mcp.triggerAction', async (span) => {
            const execution = await executeAction({
                account,
                environment,
                connectionId: args.connection_id,
                providerConfigKey: args.integration_id,
                actionName: args.action_name,
                input: args.input,
                isAsync: false,
                retryMax: 0,
                span
            });

            if (execution.result.isErr()) {
                return Err<TriggerActionOutput>(actionExecutionErrorToMcp(execution.result.error));
            }

            const response = 'data' in execution.result.value ? execution.result.value.data : execution.result.value;
            return Ok(response as TriggerActionOutput);
        });
    }
});
