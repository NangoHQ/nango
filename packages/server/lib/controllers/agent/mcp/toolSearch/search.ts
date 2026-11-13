import { Ok } from '@nangohq/utils';

import { trackAgentSessionToolSearch } from '../../../../services/agentSessionAnalytics.service.js';
import { searchSessionTools } from '../../../../services/agentSessionToolSearch.service.js';
import { defineAgentSessionMcpTool, invalidArgumentsOf } from '../sessionTool.js';
import { toolSearchInputSchema, toolSearchOutputSchema } from './schema.js';

import type { ToolSlugLookup } from '../../../../services/agentSessionToolSearch.service.js';
import type { AgentSessionCallableTools } from '../sessionTool.js';

export const toolSearchTool = defineAgentSessionMcpTool({
    name: 'nango_tool_search',
    description:
        'Search the tools this session can reach, including ones not in your tool list. Start here when no listed tool fits the task. When the task needs several tools, search for all of them in one call with one query each. Results come back grouped by query, and each match carries a tool name to pass to nango_execute, and the integration and action it stands for. If nothing fits a query, search again with other words for the action or the object before deciding no tool covers it.',
    inputSchema: toolSearchInputSchema,
    outputSchema: toolSearchOutputSchema,
    annotations: { readOnlyHint: true },
    isEnabled: (metaTools) => metaTools.nangoToolSearch,
    onInvalidArguments: ({ session }, { error }) => {
        trackAgentSessionToolSearch({ session, matches: [], related: [], errorCode: 'invalid_input', invalidArguments: invalidArgumentsOf(error) });
    },
    async handler({ args, account, environment, session, callable }) {
        return Ok(await searchSessionTools({ account, environment, session, queries: args.queries, goal: args.goal, slugOf: slugLookup(callable) }));
    }
});

/**
 * Read off the names the session already resolved, never rebuilt, because sanitising and clipping can
 * put two tools on one name and the loser is numbered, so a name is only correct in the listing that
 * produced it.
 */
function slugLookup(callable: AgentSessionCallableTools): ToolSlugLookup {
    const byIntegration = new Map<string, Map<string, string>>();

    for (const [slug, tool] of callable) {
        let byAction = byIntegration.get(tool.integrationId);
        if (!byAction) {
            byAction = new Map<string, string>();
            byIntegration.set(tool.integrationId, byAction);
        }

        byAction.set(tool.name, slug);
    }

    return ({ integration, action }) => byIntegration.get(integration)?.get(action);
}
