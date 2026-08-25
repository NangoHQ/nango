import { describe, expect, it } from 'vitest';

import { agentSessionTenantConnectionsSchema, MAX_SELECTORS, pickConnectionPerIntegration } from './agentSessionConnections.service.js';

import type { AgentSessionConnectionResolutionError } from './agentSessionConnections.service.js';
import type { ConnectionIntegrationMatchRow, ConnectionMatch, ConnectionMatchCandidate } from '@nangohq/shared';
import type { Result } from '@nangohq/utils';

describe('pickConnectionPerIntegration', () => {
    it('resolves one connection per integration', () => {
        const result = resolve({
            matches: [
                match({ integrationId: 'notion', candidates: [candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 })] }),
                match({ integrationId: 'slack', candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1', internalConnectionId: 2 })] })
            ]
        });

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toStrictEqual({
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-1', internalConnectionId: 1, configId: 10 },
            slack: { integrationId: 'slack', provider: 'slack', connectionId: 'slack-1', internalConnectionId: 2, configId: 11 }
        });
    });

    it('treats zero matches as an empty resolution rather than an error', () => {
        const result = resolve({});

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toStrictEqual({});
    });

    it('fails on an integration matching several connections, naming every candidate', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1', tags: { workspaceslug: 'marketing' } }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2', tags: { workspaceslug: 'eng' } })
                    ]
                }),
                match({ integrationId: 'slack', candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' })] })
            ]
        });

        const error = expectError(result);
        expect(error.code).toBe('ambiguous_connections');
        expect(error.message).toBe('1 integration matched more than one connection. Narrow the connection tags or pin a connection id.');
        expect(error.payload).toStrictEqual({
            integrations: {
                notion: {
                    match_count: 2,
                    candidates: [
                        { connection_id: 'notion-1', tags: { workspaceslug: 'marketing' } },
                        { connection_id: 'notion-2', tags: { workspaceslug: 'eng' } }
                    ]
                }
            }
        });
    });

    it('reports the true match count even when more matched than the candidates listed', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    matchCount: 37,
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1' }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2' })
                    ]
                })
            ]
        });

        const payload = expectError(result).payload['integrations'] as Record<string, { match_count: number; candidates: unknown[] }>;
        expect(payload['notion']?.match_count).toBe(37);
        expect(payload['notion']?.candidates).toHaveLength(2);
    });

    it('is ambiguous on a count above one even when only one candidate was sampled', () => {
        const result = resolve({
            matches: [match({ integrationId: 'notion', matchCount: 2, candidates: [candidate({ integrationId: 'notion', connectionId: 'notion-1' })] })]
        });

        expect(expectError(result).code).toBe('ambiguous_connections');
    });

    it('reports every ambiguous integration so one retry can fix them all', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1' }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2' })
                    ]
                }),
                match({
                    integrationId: 'slack',
                    candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' }), candidate({ integrationId: 'slack', connectionId: 'slack-2' })]
                })
            ]
        });

        const error = expectError(result);
        expect(Object.keys(error.payload['integrations'] as object)).toStrictEqual(['notion', 'slack']);
        expect(error.message).toBe('2 integrations matched more than one connection. Narrow the connection tags or pin a connection id.');
    });

    it('breaks a tie with a pinned connection', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2', internalConnectionId: 2 })
                    ]
                })
            ],
            verifiedPins: [pin({ integrationId: 'notion', connectionId: 'notion-2', internalConnectionId: 2 })]
        });

        expect(result.unwrap()).toStrictEqual({
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-2', internalConnectionId: 2, configId: 10 }
        });
    });

    it('keeps a pinned integration out of the ambiguity report', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2', internalConnectionId: 2 })
                    ]
                }),
                match({
                    integrationId: 'slack',
                    candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' }), candidate({ integrationId: 'slack', connectionId: 'slack-2' })]
                })
            ],
            verifiedPins: [pin({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 })]
        });

        expect(Object.keys(expectError(result).payload['integrations'] as object)).toStrictEqual(['slack']);
    });

    it('resolves an integration only a pin reached, for the no tag filter tenant', () => {
        const result = resolve({
            verifiedPins: [
                pin({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                pin({ integrationId: 'slack', connectionId: 'slack-1', internalConnectionId: 2 })
            ]
        });

        expect(Object.keys(result.unwrap())).toStrictEqual(['notion', 'slack']);
    });

    it('rejects a pin the selectors did not match, listing that integration candidates', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'notion',
                    candidates: [
                        candidate({ integrationId: 'notion', connectionId: 'notion-1', tags: { workspaceslug: 'marketing' } }),
                        candidate({ integrationId: 'notion', connectionId: 'notion-2', tags: { workspaceslug: 'eng' } })
                    ]
                })
            ],
            notMatchedPins: [{ integrationId: 'notion', connectionId: 'notion-elsewhere' }]
        });

        const error = expectError(result);
        expect(error.code).toBe('pinned_connection_not_matched');
        expect(error.payload).toStrictEqual({
            pinned: [
                {
                    integration_id: 'notion',
                    connection_id: 'notion-elsewhere',
                    candidates: [
                        { connection_id: 'notion-1', tags: { workspaceslug: 'marketing' } },
                        { connection_id: 'notion-2', tags: { workspaceslug: 'eng' } }
                    ]
                }
            ]
        });
    });

    it('rejects a pin on an integration the selectors matched nothing for', () => {
        const result = resolve({
            matches: [match({ integrationId: 'slack', candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' })] })],
            notMatchedPins: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });

        expect(expectError(result).payload).toStrictEqual({
            pinned: [{ integration_id: 'notion', connection_id: 'notion-1', candidates: [] }]
        });
    });

    it('reports a pin whose connection does not exist as unknown', () => {
        const result = resolve({
            unknownPins: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });

        const error = expectError(result);
        expect(error.code).toBe('unknown_pinned_connection');
        expect(error.payload).toStrictEqual({ pinned: [{ integration_id: 'notion', connection_id: 'notion-1' }] });
    });

    it('reports an unknown pin ahead of one the selectors merely excluded', () => {
        const result = resolve({
            unknownPins: [{ integrationId: 'notion', connectionId: 'gone' }],
            notMatchedPins: [{ integrationId: 'slack', connectionId: 'slack-elsewhere' }]
        });

        expect(expectError(result).code).toBe('unknown_pinned_connection');
    });

    it('keeps an integration whose id would collide with Object prototype', () => {
        const result = resolve({
            matches: [match({ integrationId: '__proto__', candidates: [candidate({ integrationId: '__proto__', connectionId: 'proto-1' })] })]
        });

        expect(Object.keys(result.unwrap())).toStrictEqual(['__proto__']);
        expect(result.unwrap()['__proto__']?.connectionId).toBe('proto-1');
    });

    it('reports an ambiguous integration whose id would collide with Object prototype', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: '__proto__',
                    candidates: [
                        candidate({ integrationId: '__proto__', connectionId: 'proto-1' }),
                        candidate({ integrationId: '__proto__', connectionId: 'proto-2' })
                    ]
                })
            ]
        });

        const error = expectError(result);
        expect(error.code).toBe('ambiguous_connections');
        expect(Object.keys(error.payload['integrations'] as object)).toStrictEqual(['__proto__']);
    });

    it('reports a rejected pin before ambiguity, so the caller fixes the pin first', () => {
        const result = resolve({
            matches: [
                match({
                    integrationId: 'slack',
                    candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' }), candidate({ integrationId: 'slack', connectionId: 'slack-2' })]
                })
            ],
            notMatchedPins: [{ integrationId: 'notion', connectionId: 'notion-elsewhere' }]
        });

        expect(expectError(result).code).toBe('pinned_connection_not_matched');
    });
});

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

function resolve({
    matches = [],
    verifiedPins = [],
    unknownPins = [],
    notMatchedPins = []
}: {
    matches?: ConnectionIntegrationMatchRow[];
    verifiedPins?: ConnectionMatch[];
    unknownPins?: { integrationId: string; connectionId: string }[];
    notMatchedPins?: { integrationId: string; connectionId: string }[];
}) {
    return pickConnectionPerIntegration({ matches, verifiedPins, unknownPins, notMatchedPins });
}

function expectError<T>(result: Result<T, AgentSessionConnectionResolutionError>): AgentSessionConnectionResolutionError {
    if (!result.isErr()) {
        throw new Error('Expected the resolution to fail');
    }

    return result.error;
}

function match({
    integrationId,
    candidates,
    matchCount
}: {
    integrationId: string;
    candidates: ConnectionMatchCandidate[];
    matchCount?: number;
}): ConnectionIntegrationMatchRow {
    return {
        integration_id: integrationId,
        provider: integrationId,
        match_count: matchCount ?? candidates.length,
        candidates
    };
}

function candidate({
    integrationId,
    connectionId,
    internalConnectionId,
    tags
}: {
    integrationId: string;
    connectionId: string;
    internalConnectionId?: number;
    tags?: Record<string, string>;
}): ConnectionMatchCandidate {
    return {
        id: internalConnectionId ?? 1,
        connection_id: connectionId,
        config_id: integrationId === 'notion' ? 10 : 11,
        tags: tags ?? {}
    };
}

function pin(args: { integrationId: string; connectionId: string; internalConnectionId?: number }): ConnectionMatch {
    return {
        integration_id: args.integrationId,
        provider: args.integrationId,
        candidate: candidate(args)
    };
}
