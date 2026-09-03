import { defineManagementMcpAccountTool } from '../managementTool.js';
import { docsMcpClient } from './client.js';
import { searchDocsInputSchema, searchDocsOutputSchema } from './schema.js';

import type { SearchDocsOutput } from './schema.js';

export const searchDocsTool = defineManagementMcpAccountTool<typeof searchDocsInputSchema, SearchDocsOutput>({
    name: 'docs_search',
    description:
        'Search the Nango documentation for relevant guides, API references, and examples. Returns contextual snippets with titles and links. Use docs_query_filesystem to read the full content of a page returned by this tool.',
    inputSchema: searchDocsInputSchema,
    outputSchema: searchDocsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    requiredScopes: { none: true },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args }) {
        return (await docsMcpClient.callTool('search_nango_docs', { query: args.query })).map((results) => ({ results }));
    }
});
