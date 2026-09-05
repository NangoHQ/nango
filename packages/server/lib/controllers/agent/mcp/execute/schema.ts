import * as z from 'zod/v4';

import { MAX_TOOL_NAME_LENGTH } from '../sessionTool.js';

export const executeInputSchema = z
    .object({
        tool: z
            .string()
            .min(1)
            .max(MAX_TOOL_NAME_LENGTH)
            .regex(/^[a-zA-Z0-9_-]+$/)
            .describe('The tool name, as listed in tools/list or returned by nango_tool_search.'),
        // A tool's input is validated against its own deployed schema, which can have any JSON root.
        input: z.json().optional().describe('The input to pass to the tool.')
    })
    .strict();
