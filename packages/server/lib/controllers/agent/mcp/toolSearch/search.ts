import { Err } from '@nangohq/utils';

import { PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { toolSearchInputSchema } from './schema.js';

/**
 * Listed but not yet answerable. The search itself lands in NAN-6603, which replaces this handler
 * and settles the result shape. What is already fixed is that a result names an integration and an
 * unqualified tool, which is what nango_execute takes.
 */
export const toolSearchTool = defineAgentSessionMcpTool({
    name: 'nango_tool_search',
    description:
        'Search the tools this session can reach that are not already listed. Returns tool names to pass to nango_execute, so start here when no listed tool fits the task.',
    inputSchema: toolSearchInputSchema,
    annotations: { readOnlyHint: true },
    isEnabled: (metaTools) => metaTools.nangoToolSearch,
    handler() {
        return Err(new PublicMcpError("Tool 'nango_tool_search' cannot be called yet on an agent session."));
    }
});
