import { Ok } from '@nangohq/utils';

import { trackAgentSessionToolSearch } from '../../../../services/agentSessionAnalytics.service.js';
import { toolSearchToolDefinition } from '../../../../services/agentSessionToolCatalog.service/index.js';
import { searchSessionTools } from '../../../../services/agentSessionToolSearch.service.js';
import { invalidArgumentsOf, makeAgentSessionMcpTool } from '../sessionTool.js';

import type { AgentSessionCallableTools } from '../../../../services/agentSessionToolCatalog.service/index.js';
import type { ToolSlugLookup } from '../../../../services/agentSessionToolSearch.service.js';

export const toolSearchTool = makeAgentSessionMcpTool({
    ...toolSearchToolDefinition,
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
