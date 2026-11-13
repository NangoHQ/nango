import { defineManagementMcpTool } from '../managementTool.js';
import { docsMcpClient } from './client.js';
import { searchDocsInputSchema, searchDocsOutputSchema } from './schema.js';

import type { SearchDocsOutput } from './schema.js';

export const searchDocsTool = defineManagementMcpTool<typeof searchDocsInputSchema, SearchDocsOutput>({
    name: 'docs_search',
    title: 'Search Nango Documentation',
    description:
        'Searches the Nango documentation for guides, API references, and examples. Returns contextual snippets with titles and links; docs_query_filesystem can return full pages.',
    inputSchema: searchDocsInputSchema,
    outputSchema: searchDocsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    requiredScopes: { none: true },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args }) {
        return (await docsMcpClient.callTool('search_nango_docs', { query: args.query })).map((results) => ({ results }));
    }
});
