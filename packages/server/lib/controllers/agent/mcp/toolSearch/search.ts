import { Ok } from '@nangohq/utils';

import { searchSessionTools } from '../../../../services/agentSessionToolSearch.service.js';
import { INTEGRATION_META_KEY, listSessionTools, TOOL_META_KEY } from '../sessionServer.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { toolSearchInputSchema } from './schema.js';

import type { AgentSession } from '@nangohq/types';

export const toolSearchTool = defineAgentSessionMcpTool({
    name: 'nango_tool_search',
    description:
        'Search the tools this session can reach, including ones not in your tool list. Start here when no listed tool fits the task. Each result carries an integration and a tool name to pass to nango_execute, and a result already in your tool list also carries listed_as, the name you can call it by directly.',
    inputSchema: toolSearchInputSchema,
    annotations: { readOnlyHint: true },
    isEnabled: (metaTools) => metaTools.nangoToolSearch,
    async handler({ args, session }) {
        return Ok(await searchSessionTools({ session, query: args.query, listedNameFor: listedNameLookup(session) }));
    }
});

function listedNameLookup(session: AgentSession): (tool: { integration: string; tool: string }) => string | undefined {
    const listed = new Map<string, Map<string, string>>();

    for (const tool of listSessionTools(session)) {
        const integrationId = tool._meta?.[INTEGRATION_META_KEY];
        const toolName = tool._meta?.[TOOL_META_KEY];

        if (typeof integrationId !== 'string' || typeof toolName !== 'string') {
            continue;
        }

        let byTool = listed.get(integrationId);
        if (!byTool) {
            byTool = new Map<string, string>();
            listed.set(integrationId, byTool);
        }

        byTool.set(toolName, tool.name);
    }

    return ({ integration, tool }) => listed.get(integration)?.get(tool);
}
