import { describe, expect, it } from 'vitest';

import {
    agentSessionMetaToolsSchema,
    expiresInToMs,
    metaToolsSummary,
    parseMetaTools,
    resolvedConnectionsSummary,
    toolsetSummary,
    toolsetToolNames
} from './agentSessionCreation.service.js';

describe('expiresInToMs', () => {
    it.each([
        ['60s', 60_000],
        ['5m', 300_000],
        ['2h', 7_200_000],
        ['15d', 1_296_000_000]
    ])('parses %s', (expiresIn, expected) => {
        expect(expiresInToMs(expiresIn)).toBe(expected);
    });

    it.each(['', '5', 's', '5x', '0s', '1.5h', '-1d', '5 m', '5S'])('returns null for %s', (expiresIn) => {
        expect(expiresInToMs(expiresIn)).toBeNull();
    });
});

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

describe('parseMetaTools', () => {
    it('applies the defaults when nothing is requested', () => {
        expect(parseMetaTools(undefined)).toStrictEqual({
            applied: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } },
            unknown: []
        });
    });

    it('overrides only the meta tools the caller named', () => {
        expect(parseMetaTools({ nango_execute: { enabled: false }, nango_proxy: { enabled: true } })).toStrictEqual({
            applied: { nangoToolSearch: true, nangoExecute: false, nangoProxy: true, nangoCreateConnection: { enabled: false, tags: {} } },
            unknown: []
        });
    });

    it('keeps the tags nango_create_connection was configured with', () => {
        expect(parseMetaTools({ nango_create_connection: { enabled: true, tags: { enduser: '74' } } }).applied.nangoCreateConnection).toStrictEqual({
            enabled: true,
            tags: { enduser: '74' }
        });
    });

    it('defaults the tags when the object form leaves them out', () => {
        expect(parseMetaTools({ nango_create_connection: { enabled: true } }).applied.nangoCreateConnection).toStrictEqual({ enabled: true, tags: {} });
    });

    it('collects the keys that are not meta tools Nango ships', () => {
        const parsed = parseMetaTools({ nango_proxy: { enabled: true }, nango_teleport: true, proxy: false });

        expect(parsed.unknown).toStrictEqual(['nango_teleport', 'proxy']);
        expect(parsed.applied.nangoProxy).toBe(true);
    });
});

describe('agentSessionMetaToolsSchema', () => {
    it('widens a bare boolean to the object form', () => {
        expect(agentSessionMetaToolsSchema.safeParse({ nango_proxy: true, nango_create_connection: false })).toStrictEqual({
            success: true,
            data: { nango_proxy: { enabled: true }, nango_create_connection: { enabled: false } }
        });
    });

    it('accepts a boolean and the object form for nango_create_connection', () => {
        expect(agentSessionMetaToolsSchema.safeParse({ nango_proxy: true, nango_create_connection: { enabled: true, tags: { enduser: '74' } } }).success).toBe(
            true
        );
    });

    it('refuses tags on a meta tool that creates nothing to put them on', () => {
        const parsed = agentSessionMetaToolsSchema.safeParse({ nango_tool_search: { enabled: true, tags: { team: 'x' } } });

        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]?.message).toBe('Unrecognized key: "tags"');
        expect(parsed.error?.issues[0]?.path).toStrictEqual(['nango_tool_search']);
    });

    it('leaves room for the reserved session tag', () => {
        const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`tag${i}`, 'v']));
        const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tag${i}`, 'v']));

        expect(agentSessionMetaToolsSchema.safeParse({ nango_create_connection: { enabled: true, tags: nine } }).success).toBe(true);
        expect(agentSessionMetaToolsSchema.safeParse({ nango_create_connection: { enabled: true, tags: ten } }).success).toBe(false);
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
