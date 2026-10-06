import { describe, expect, it } from 'vitest';

import {
    agentSessionMetaToolsSchema,
    agentSessionPinnedToolsSchema,
    agentSessionTenantConnectionsSchema,
    agentSessionToolsetSchema,
    expiresInToMs,
    MAX_SELECTORS
} from './postSessions.js';

describe('agentSessionTenantConnectionsSchema', () => {
    it('normalizes the public shape into the resolver contract', () => {
        const parsed = agentSessionTenantConnectionsSchema.parse({
            any: [{ tags: { WorkspaceSlug: 'marketing' } }, { tags: { end_user_id: 'user-74', organization_id: 'acme' } }],
            pinned: [{ integration_id: 'notion', connection_id: 'notion-1' }]
        });

        expect(parsed).toStrictEqual({
            any: [{ tags: { workspaceslug: 'marketing' } }, { tags: { end_user_id: 'user-74', organization_id: 'acme' } }],
            pinned: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });
    });

    it('accepts selectors with no pins', () => {
        const parsed = agentSessionTenantConnectionsSchema.parse({ any: [{ tags: { end_user_id: 'user-74' } }] });

        expect(parsed.pinned).toStrictEqual([]);
    });

    it('accepts pins with no selectors, the escape hatch that applies no tag filter', () => {
        const parsed = agentSessionTenantConnectionsSchema.parse({ pinned: [{ integration_id: 'notion', connection_id: 'notion-1' }] });

        expect(parsed.any).toStrictEqual([]);
    });

    it('accepts one pin per integration without an arbitrary count limit', () => {
        const pinned = Array.from({ length: 200 }, (_, index) => ({ integration_id: `integration-${index}`, connection_id: `connection-${index}` }));

        expect(agentSessionTenantConnectionsSchema.safeParse({ pinned }).success).toBe(true);
    });

    it('rejects a tenant that constrains nothing at all', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({}).success).toBe(false);
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [], pinned: [] }).success).toBe(false);
    });

    it('rejects a selector that constrains nothing', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{}] }).success).toBe(false);
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ tags: {} }] }).success).toBe(false);
    });

    it('rejects end user fields, since end users are selected through their tags', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ end_user_id: 'user-74' }] }).success).toBe(false);
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ tags: { workspaceslug: 'marketing' }, end_user_id: 'user-74' }] }).success).toBe(false);
    });

    it('rejects two pins on the same integration', () => {
        const result = agentSessionTenantConnectionsSchema.safeParse({
            pinned: [
                { integration_id: 'notion', connection_id: 'notion-1' },
                { integration_id: 'notion', connection_id: 'notion-2' }
            ]
        });

        expect(result.success).toBe(false);
    });

    it('rejects an oversized selector list', () => {
        expect(
            agentSessionTenantConnectionsSchema.safeParse({ any: Array.from({ length: MAX_SELECTORS + 1 }, () => ({ tags: { endUser: 'user-74' } })) }).success
        ).toBe(false);
    });

    it('rejects unknown keys so a typo never silently widens the selector', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ tag: { a: 'b' } }] }).success).toBe(false);
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ tags: { endUser: 'user-74' } }], connections: [] }).success).toBe(false);
    });
});

describe('agentSessionToolsetSchema', () => {
    it('normalises every shorthand to an allow and deny pair', () => {
        expect(
            agentSessionToolsetSchema.parse({
                notion: { allow: { tools: ['read_doc'] } },
                slack: { deny: { tools: ['send_message'] } },
                github: '*',
                linear: {}
            })
        ).toEqual({
            notion: { allow: ['read_doc'], deny: [] },
            slack: { allow: '*', deny: ['send_message'] },
            github: { allow: '*', deny: [] },
            linear: { allow: '*', deny: [] }
        });
    });

    it('keeps deny alongside an explicit allow', () => {
        expect(agentSessionToolsetSchema.parse({ notion: { allow: { tools: ['read_doc', 'upsert_doc'] }, deny: { tools: ['upsert_doc'] } } })).toEqual({
            notion: { allow: ['read_doc', 'upsert_doc'], deny: ['upsert_doc'] }
        });
    });

    it('accepts the environment wide shorthand', () => {
        expect(agentSessionToolsetSchema.parse('*')).toBe('*');
    });

    it('accepts dotted tool names, which MCP server tools can carry', () => {
        expect(agentSessionToolsetSchema.parse({ 'linear-mcp': { allow: { tools: ['issues.list'] } } })).toEqual({
            'linear-mcp': { allow: ['issues.list'], deny: [] }
        });
    });

    it('rejects an empty toolset', () => {
        expect(agentSessionToolsetSchema.safeParse({}).success).toBe(false);
    });

    it('rejects denying every tool, since leaving the integration out says the same thing', () => {
        expect(agentSessionToolsetSchema.safeParse({ notion: { deny: '*' } }).success).toBe(false);
        expect(agentSessionToolsetSchema.safeParse({ notion: { allow: { tools: ['read_doc'] }, deny: '*' } }).success).toBe(false);
    });

    it('keeps the star shorthand on allow', () => {
        expect(agentSessionToolsetSchema.parse({ notion: { allow: '*' } })).toEqual({ notion: { allow: '*', deny: [] } });
    });

    it('rejects unknown keys on an integration policy', () => {
        expect(agentSessionToolsetSchema.safeParse({ notion: { allow: { tags: { destructive: true } } } }).success).toBe(false);
    });

    it('rejects a pinned tools map keyed by nothing', () => {
        expect(agentSessionPinnedToolsSchema.safeParse({ notion: ['read_doc'] }).success).toBe(true);
        expect(agentSessionPinnedToolsSchema.safeParse({ notion: 'read_doc' }).success).toBe(false);
    });
});

describe('agentSessionMetaToolsSchema', () => {
    it('widens a bare boolean to the object form', () => {
        expect(agentSessionMetaToolsSchema.parse({ nango_proxy: true, nango_create_connection: false })).toStrictEqual({
            metaTools: { nangoProxy: true, nangoCreateConnection: { enabled: false, tags: {} } },
            unknown: []
        });
    });

    it('maps only the meta tools the caller named', () => {
        expect(agentSessionMetaToolsSchema.parse({ nango_execute: { enabled: false }, nango_proxy: { enabled: true } })).toStrictEqual({
            metaTools: { nangoExecute: false, nangoProxy: true },
            unknown: []
        });
    });

    it('keeps the tags nango_create_connection was configured with', () => {
        expect(agentSessionMetaToolsSchema.parse({ nango_create_connection: { enabled: true, tags: { enduser: '74' } } }).metaTools).toStrictEqual({
            nangoCreateConnection: { enabled: true, tags: { enduser: '74' } }
        });
    });

    it('defaults the tags when the object form leaves them out', () => {
        expect(agentSessionMetaToolsSchema.parse({ nango_create_connection: { enabled: true } }).metaTools).toStrictEqual({
            nangoCreateConnection: { enabled: true, tags: {} }
        });
    });

    it('collects the keys that are not meta tools Nango ships', () => {
        const parsed = agentSessionMetaToolsSchema.parse({ nango_proxy: { enabled: true }, nango_teleport: true, proxy: false });

        expect(parsed.unknown).toStrictEqual(['nango_teleport', 'proxy']);
        expect(parsed.metaTools).toStrictEqual({ nangoProxy: true });
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
