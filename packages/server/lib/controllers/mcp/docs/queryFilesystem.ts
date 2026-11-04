import { defineManagementMcpTool } from '../managementTool.js';
import { docsMcpClient } from './client.js';
import { queryDocsFilesystemInputSchema, queryDocsFilesystemOutputSchema } from './schema.js';

import type { QueryDocsFilesystemOutput } from './schema.js';

export const queryDocsFilesystemTool = defineManagementMcpTool<typeof queryDocsFilesystemInputSchema, QueryDocsFilesystemOutput>({
    name: 'docs_query_filesystem',
    title: 'Query Nango Documentation Filesystem',
    description:
        "Runs a read-only shell-like command against Mintlify's virtual Nango documentation filesystem to read pages, browse its structure, or search exact text. Supported commands include rg, grep, find, tree, ls, cat, head, tail, sed, awk, and jq. The filesystem is an isolated documentation sandbox, separate from the Nango server and the caller's computer.",
    inputSchema: queryDocsFilesystemInputSchema,
    outputSchema: queryDocsFilesystemOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    requiredScopes: { none: true },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args }) {
        return (await docsMcpClient.callTool('query_docs_filesystem_nango_docs', { command: args.command })).map((content) => ({
            output: content.join('\n\n')
        }));
    }
});
