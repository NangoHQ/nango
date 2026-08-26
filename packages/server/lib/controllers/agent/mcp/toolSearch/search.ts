// TODO: implemented in NAN-6603
import * as z from 'zod/v4';

import { Err } from '@nangohq/utils';

import { PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';

export const toolSearchTool = defineAgentSessionMcpTool({
    name: 'nango_tool_search',
    description:
        'Search the tools this session can reach that are not already listed. Returns tool names to pass to nango_execute, so start here when no listed tool fits the task.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(255).describe('What the tool should do, in plain language.') }).strict(),
    annotations: { readOnlyHint: true },
    isEnabled: (metaTools) => metaTools.nangoToolSearch,
    handler() {
        return Err(new PublicMcpError("Tool 'nango_tool_search' cannot be called yet on an agent session."));
    }
});
