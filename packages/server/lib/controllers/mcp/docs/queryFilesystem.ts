import { defineManagementMcpAccountTool } from '../managementTool.js';
import { docsMcpClient } from './client.js';
import { queryDocsFilesystemInputSchema, queryDocsFilesystemOutputSchema } from './schema.js';

import type { QueryDocsFilesystemOutput } from './schema.js';

export const queryDocsFilesystemTool = defineManagementMcpAccountTool<typeof queryDocsFilesystemInputSchema, QueryDocsFilesystemOutput>({
    name: 'docs_query_filesystem',
    description:
        "Run a read-only shell-like command against Mintlify's virtual Nango documentation filesystem. Use this to read full pages, browse the documentation structure, or perform exact text searches. Supported commands include rg, grep, find, tree, ls, cat, head, tail, sed, awk, and jq. The filesystem is an isolated documentation sandbox, not the Nango server or the caller's computer.",
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
