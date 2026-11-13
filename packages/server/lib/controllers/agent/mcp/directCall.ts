import { Err } from '@nangohq/utils';

import { trackAgentSessionToolCall } from '../../../services/agentSessionAnalytics.service.js';
import { formatMcpArgumentsError, PublicMcpError } from '../../mcp/utils.js';
import { directCallSchema } from './directCallSchema.js';
import { executeSessionTool } from './execute/execute.js';
import { invalidArgumentsOf } from './sessionTool.js';

import type { AgentSessionCallableTool, AgentSessionMcpContext } from './sessionTool.js';
import type { Result } from '@nangohq/utils';

const WRAPPED_KEYS = new Set(['input', 'goal', 'intent']);

/**
 * Sessions created before the wrapped shape was advertised still call tools with the bare input, so
 * both are accepted (NAN-8005). Only goal and intent together with nothing but an input count as
 * wrapped, which a tool's own input is very unlikely to look like.
 */
export async function executeDirectToolCall({
    name,
    tool,
    args,
    context
}: {
    name: string;
    tool: AgentSessionCallableTool;
    args: unknown;
    context: AgentSessionMcpContext;
}): Promise<Result<unknown>> {
    const target = { integrationId: tool.integrationId, toolName: tool.name, pinned: tool.pinned, context };

    if (!isWrapped(args)) {
        return await executeSessionTool({ ...target, input: args });
    }

    const parsed = directCallSchema.safeParse(args);
    if (!parsed.success) {
        trackAgentSessionToolCall({
            session: context.session,
            integrationId: tool.integrationId,
            toolName: tool.name,
            pinned: tool.pinned,
            errorCode: 'invalid_input',
            invalidArguments: invalidArgumentsOf(parsed.error)
        });
        return Err(
            new PublicMcpError(`${formatMcpArgumentsError(name, parsed.error)}. Correct the arguments and call it again.`, {
                code: 'invalid_input',
                integrationId: tool.integrationId
            })
        );
    }

    const { input, goal, intent } = parsed.data;
    return await executeSessionTool({ ...target, input, purpose: { goal, intent } });
}

function isWrapped(args: unknown): boolean {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return false;
    }

    const keys = Object.keys(args);
    return keys.includes('goal') && keys.includes('intent') && keys.every((key) => WRAPPED_KEYS.has(key));
}
