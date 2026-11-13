import { describe, expect, it } from 'vitest';

import { metaToolsSummary, toolsetSummary } from './agentSession.js';

describe('toolsetSummary', () => {
    it('counts the tools per integration and marks the ones with no connection', () => {
        const summary = toolsetSummary(
            {
                notion: {
                    provider: 'notion',
                    pinned: [{ name: 'read_doc', description: 'Read a doc' }],
                    searchable: [{ name: 'upsert_doc', description: 'Upsert a doc' }]
                },
                reddit: { provider: 'reddit', pinned: [], searchable: [{ name: 'search_posts', description: 'Search posts' }] }
            },
            {
                notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-1', internalConnectionId: 1, configId: 10 }
            }
        );

        expect(summary).toStrictEqual({
            notion: { connected: true, tools_pinned: 1, tools_searchable: 1 },
            reddit: { connected: false, tools_pinned: 0, tools_searchable: 1 }
        });
    });
});

describe('metaToolsSummary', () => {
    it('reports every meta tool under its request name', () => {
        expect(
            metaToolsSummary({ nangoToolSearch: true, nangoExecute: false, nangoProxy: true, nangoCreateConnection: { enabled: false, tags: {} } })
        ).toStrictEqual({
            nango_tool_search: true,
            nango_execute: false,
            nango_proxy: true,
            nango_create_connection: { enabled: false, tags: {} }
        });
    });
});
