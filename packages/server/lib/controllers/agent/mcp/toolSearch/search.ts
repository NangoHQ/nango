import { Ok } from '@nangohq/utils';

import { searchSessionTools } from '../../../../services/agentSessionToolSearch.service.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { toolSearchInputSchema, toolSearchOutputSchema } from './schema.js';

import type { ToolSlugLookup } from '../../../../services/agentSessionToolSearch.service.js';
import type { AgentSessionCallableTools } from '../sessionTool.js';

export const toolSearchTool = defineAgentSessionMcpTool({
    name: 'nango_tool_search',
    description:
        'Search the tools this session can reach, including ones not in your tool list. Start here when no listed tool fits the task. Each result carries a tool name to pass to nango_execute, and the integration and action it stands for.',
    inputSchema: toolSearchInputSchema,
    outputSchema: toolSearchOutputSchema,
    annotations: { readOnlyHint: true },
    isEnabled: (metaTools) => metaTools.nangoToolSearch,
    async handler({ args, session, callable }) {
        return Ok(await searchSessionTools({ session, query: args.query, slugOf: slugLookup(callable) }));
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
