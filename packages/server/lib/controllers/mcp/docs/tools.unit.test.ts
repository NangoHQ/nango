import { afterEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { docsMcpClient } from './client.js';
import { queryDocsFilesystemTool } from './queryFilesystem.js';
import { searchDocsTool } from './search.js';

import type { ManagementMcpContext } from '../managementTool.js';

const context = {
    account: {},
    environment: {},
    plan: null,
    grantedScopes: ['environment:mcp']
} as ManagementMcpContext;

describe('Management MCP documentation tools', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forwards documentation searches to Mintlify', async () => {
        const callTool = vi.spyOn(docsMcpClient, 'callTool').mockResolvedValue(Ok(['first result', 'second result']));

        const result = await searchDocsTool.handler({ query: 'authentication' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ results: ['first result', 'second result'] });
        }
        expect(callTool).toHaveBeenCalledWith('search_nango_docs', { query: 'authentication' });
    });

    it('forwards filesystem queries and preserves all returned text', async () => {
        const callTool = vi.spyOn(docsMcpClient, 'callTool').mockResolvedValue(Ok(['first block', 'second block']));

        const result = await queryDocsFilesystemTool.handler({ command: 'head -80 /quickstart.mdx' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ output: 'first block\n\nsecond block' });
        }
        expect(callTool).toHaveBeenCalledWith('query_docs_filesystem_nango_docs', { command: 'head -80 /quickstart.mdx' });
    });

    it('rejects invalid input before calling Mintlify', async () => {
        const callTool = vi.spyOn(docsMcpClient, 'callTool');

        const searchResult = await searchDocsTool.handler({ query: '' }, context);
        const queryResult = await queryDocsFilesystemTool.handler({ command: '' }, context);

        expect(searchResult.isErr()).toBe(true);
        expect(queryResult.isErr()).toBe(true);
        expect(callTool).not.toHaveBeenCalled();
    });
});
