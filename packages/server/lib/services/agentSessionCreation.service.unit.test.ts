import { describe, expect, it } from 'vitest';

import { expiresInToMs, metaToolsSummary, parseMetaTools, toolsetSummary } from './agentSessionCreation.service.js';

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

describe('parseMetaTools', () => {
    it('applies the defaults when nothing is requested', () => {
        expect(parseMetaTools(undefined)).toStrictEqual({
            applied: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false },
            unknown: []
        });
    });

    it('overrides only the meta tools the caller named', () => {
        expect(parseMetaTools({ nango_execute: false, nango_proxy: true })).toStrictEqual({
            applied: { nangoToolSearch: true, nangoExecute: false, nangoProxy: true },
            unknown: []
        });
    });

    it('collects the keys that are not meta tools Nango ships', () => {
        const parsed = parseMetaTools({ nango_proxy: true, nango_teleport: true, proxy: false });

        expect(parsed.unknown).toStrictEqual(['nango_teleport', 'proxy']);
        expect(parsed.applied.nangoProxy).toBe(true);
    });
});

describe('metaToolsSummary', () => {
    it('reports every meta tool under its request name', () => {
        expect(metaToolsSummary({ nangoToolSearch: true, nangoExecute: false, nangoProxy: true })).toStrictEqual({
            nango_tool_search: true,
            nango_execute: false,
            nango_proxy: true
        });
    });
});
