import { describe, expect, it } from 'vitest';

import { agentSessionTenantConnectionsSchema, MAX_SELECTORS, resolveTenantConnections } from './agentSessionConnections.service.js';

import type { AgentSessionConnectionResolutionError } from './agentSessionConnections.service.js';
import type { AgentSessionConnectionCandidate } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

describe('resolveTenantConnections', () => {
    it('resolves one connection per integration', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                candidate({ integrationId: 'slack', connectionId: 'slack-1', internalConnectionId: 2 })
            ],
            disambiguation: []
        });

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toStrictEqual({
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-1', internalConnectionId: 1, configId: 10 },
            slack: { integrationId: 'slack', provider: 'slack', connectionId: 'slack-1', internalConnectionId: 2, configId: 11 }
        });
    });

    it('treats zero matches as an empty resolution rather than an error', () => {
        const result = resolveTenantConnections({ candidates: [], disambiguation: [] });

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toStrictEqual({});
    });

    it('fails on an integration matching several connections, naming every candidate', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1', tags: { workspaceslug: 'marketing' } }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2', tags: { workspaceslug: 'eng' } }),
                candidate({ integrationId: 'slack', connectionId: 'slack-1' })
            ],
            disambiguation: []
        });

        expect(result.isErr()).toBe(true);
        const error = expectError(result);
        expect(error.code).toBe('ambiguous_connections');
        expect(error.message).toBe('1 integration matched more than one connection. Narrow the connection tags or pin a connection id.');
        expect(error.payload).toStrictEqual({
            integrations: {
                notion: {
                    candidates: [
                        { connection_id: 'notion-1', tags: { workspaceslug: 'marketing' } },
                        { connection_id: 'notion-2', tags: { workspaceslug: 'eng' } }
                    ]
                }
            }
        });
    });

    it('reports every ambiguous integration so one retry can fix them all', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1' }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2' }),
                candidate({ integrationId: 'slack', connectionId: 'slack-1' }),
                candidate({ integrationId: 'slack', connectionId: 'slack-2' })
            ],
            disambiguation: []
        });

        const error = expectError(result);
        expect(error.code).toBe('ambiguous_connections');
        expect(Object.keys(error.payload['integrations'] as object)).toStrictEqual(['notion', 'slack']);
        expect(error.message).toBe('2 integrations matched more than one connection. Narrow the connection tags or pin a connection id.');
    });

    it('breaks a tie with a pinned connection', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2', internalConnectionId: 2 })
            ],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-2' }]
        });

        expect(result.unwrap()).toStrictEqual({
            notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-2', internalConnectionId: 2, configId: 10 }
        });
    });

    it('breaks ties per integration when two selectors both match the same integration', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-marketing', internalConnectionId: 1 }),
                candidate({ integrationId: 'notion', connectionId: 'notion-eng', internalConnectionId: 2 }),
                candidate({ integrationId: 'slack', connectionId: 'slack-marketing', internalConnectionId: 3 }),
                candidate({ integrationId: 'slack', connectionId: 'slack-eng', internalConnectionId: 4 })
            ],
            disambiguation: [
                { integrationId: 'notion', connectionId: 'notion-marketing' },
                { integrationId: 'slack', connectionId: 'slack-eng' }
            ]
        });

        expect(Object.values(result.unwrap()).map((connection) => connection.connectionId)).toStrictEqual(['notion-marketing', 'slack-eng']);
    });

    it('accepts a pin on an integration that was never ambiguous', () => {
        const result = resolveTenantConnections({
            candidates: [candidate({ integrationId: 'notion', connectionId: 'notion-1' })],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });

        expect(result.isOk()).toBe(true);
    });

    it('rejects a pin naming a connection the selectors did not match, so a pin can only narrow', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1', tags: { workspaceslug: 'marketing' } }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2', tags: { workspaceslug: 'eng' } })
            ],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-elsewhere' }]
        });

        const error = expectError(result);
        expect(error.code).toBe('invalid_disambiguation');
        expect(error.payload).toStrictEqual({
            disambiguation: [
                {
                    integration_id: 'notion',
                    connection_id: 'notion-elsewhere',
                    reason: 'connection_not_a_candidate',
                    candidates: [
                        { connection_id: 'notion-1', tags: { workspaceslug: 'marketing' } },
                        { connection_id: 'notion-2', tags: { workspaceslug: 'eng' } }
                    ]
                }
            ]
        });
    });

    it('rejects a pin on an integration the selectors did not match at all', () => {
        const result = resolveTenantConnections({
            candidates: [candidate({ integrationId: 'slack', connectionId: 'slack-1' })],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });

        const error = expectError(result);
        expect(error.code).toBe('invalid_disambiguation');
        expect(error.payload).toStrictEqual({
            disambiguation: [{ integration_id: 'notion', connection_id: 'notion-1', reason: 'no_candidates', candidates: [] }]
        });
    });

    it('rejects two pins on the same integration', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1', internalConnectionId: 1 }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2', internalConnectionId: 2 })
            ],
            disambiguation: [
                { integrationId: 'notion', connectionId: 'notion-1' },
                { integrationId: 'notion', connectionId: 'notion-2' }
            ]
        });

        const error = expectError(result);
        expect(error.code).toBe('invalid_disambiguation');
        expect((error.payload['disambiguation'] as { reason: string }[])[0]?.reason).toBe('duplicate_pin');
    });

    it('reports an invalid pin before it reports ambiguity, so the caller fixes the pin first', () => {
        const result = resolveTenantConnections({
            candidates: [
                candidate({ integrationId: 'notion', connectionId: 'notion-1' }),
                candidate({ integrationId: 'notion', connectionId: 'notion-2' }),
                candidate({ integrationId: 'slack', connectionId: 'slack-1' }),
                candidate({ integrationId: 'slack', connectionId: 'slack-2' })
            ],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-elsewhere' }]
        });

        expect(expectError(result).code).toBe('invalid_disambiguation');
    });
});

describe('agentSessionTenantConnectionsSchema', () => {
    it('normalizes the public shape into the resolver contract', () => {
        const parsed = agentSessionTenantConnectionsSchema.parse({
            any: [{ tags: { WorkspaceSlug: 'marketing' } }, { end_user_id: 'user-74', end_user_organization_id: 'acme' }],
            disambiguation: [{ integration_id: 'notion', connection_id: 'notion-1' }]
        });

        expect(parsed).toStrictEqual({
            any: [
                { tags: { workspaceslug: 'marketing' }, endUserId: undefined, endUserOrganizationId: undefined },
                { tags: undefined, endUserId: 'user-74', endUserOrganizationId: 'acme' }
            ],
            disambiguation: [{ integrationId: 'notion', connectionId: 'notion-1' }]
        });
    });

    it('defaults disambiguation to an empty list', () => {
        const parsed = agentSessionTenantConnectionsSchema.parse({ any: [{ end_user_id: 'user-74' }] });

        expect(parsed.disambiguation).toStrictEqual([]);
    });

    it('rejects a selector that constrains nothing', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{}] }).success).toBe(false);
    });

    it('rejects an empty or oversized selector list', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [] }).success).toBe(false);
        expect(
            agentSessionTenantConnectionsSchema.safeParse({ any: Array.from({ length: MAX_SELECTORS + 1 }, () => ({ end_user_id: 'user-74' })) }).success
        ).toBe(false);
    });

    it('rejects unknown keys so a typo never silently widens the selector', () => {
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ tag: { a: 'b' } }] }).success).toBe(false);
        expect(agentSessionTenantConnectionsSchema.safeParse({ any: [{ end_user_id: 'user-74' }], connections: [] }).success).toBe(false);
    });
});

function expectError<T>(result: Result<T, AgentSessionConnectionResolutionError>): AgentSessionConnectionResolutionError {
    if (!result.isErr()) {
        throw new Error('Expected the resolution to fail');
    }

    return result.error;
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
}): AgentSessionConnectionCandidate {
    return {
        integrationId,
        provider: integrationId,
        connectionId,
        internalConnectionId: internalConnectionId ?? 1,
        configId: integrationId === 'notion' ? 10 : 11,
        tags: tags ?? {}
    };
}
