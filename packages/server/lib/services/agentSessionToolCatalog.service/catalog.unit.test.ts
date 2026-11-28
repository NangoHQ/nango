import { expect, it, vi } from 'vitest';

import { withActionInputSchemas } from './catalog.js';
import { directCallInputSchema } from './directCallSchema.js';

import type { AgentSessionToolInput } from '@nangohq/types';

const findActionInputs = vi.hoisted(() => vi.fn());
vi.mock('../agentSessionToolSearch.service.js', () => ({ findActionInputs }));

it('enriches only actions on the selected page without changing the catalog or remote tool schemas', async () => {
    const fallback = directCallInputSchema(undefined);
    const remoteSchema = directCallInputSchema({ type: 'object', properties: { title: { type: 'string' } } });
    const page = [
        { name: 'github__create_issue', description: 'Create an issue', inputSchema: fallback },
        { name: 'remote__search', description: 'Search', inputSchema: remoteSchema }
    ];
    const actions = new Map([
        ['github__create_issue', { integrationId: 'github', name: 'create_issue' }],
        ['github__list_issues', { integrationId: 'github', name: 'list_issues' }]
    ]);
    findActionInputs.mockResolvedValue(new Map([['github', new Map<string, AgentSessionToolInput>([['create_issue', { kind: 'none' }]])]]));

    const enriched = await withActionInputSchemas({ page, actions, environmentId: 42 });

    expect(findActionInputs).toHaveBeenCalledExactlyOnceWith({
        environmentId: 42,
        actions: [{ integrationId: 'github', name: 'create_issue' }]
    });
    expect(enriched[0]?.inputSchema).toEqual(directCallInputSchema('none'));
    expect(enriched[1]?.inputSchema).toBe(remoteSchema);
    expect(page[0]?.inputSchema).toBe(fallback);
});
