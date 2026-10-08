import { describe, expect, it } from 'vitest';

import { resolvedConnectionsSummary, toolsetToolNames } from './agentSession.service.js';

describe('resolvedConnectionsSummary', () => {
    it('drops the internal connection and config ids', () => {
        expect(
            resolvedConnectionsSummary({
                notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-1', internalConnectionId: 1, configId: 10 }
            })
        ).toStrictEqual({
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-1' }
        });
    });
});

describe('toolsetToolNames', () => {
    it('keeps the tool names and drops the descriptions', () => {
        expect(
            toolsetToolNames({
                notion: {
                    provider: 'notion',
                    pinned: [{ name: 'read_doc', description: 'Read a doc' }],
                    searchable: [{ name: 'upsert_doc', description: 'Upsert a doc' }]
                },
                reddit: { provider: 'reddit', pinned: [], searchable: [{ name: 'search_posts', description: 'Search posts' }] }
            })
        ).toStrictEqual({
            notion: { provider: 'notion', pinned: ['read_doc'], searchable: ['upsert_doc'] },
            reddit: { provider: 'reddit', pinned: [], searchable: ['search_posts'] }
        });
    });
});
