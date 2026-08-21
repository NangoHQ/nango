import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import * as logs from '@nangohq/logs';
import { configService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import * as hooks from '../hooks/hooks.js';
import { createConnectSession } from './connectSession.service.js';

import type { DBEnvironment, DBPlan, DBTeam, PrivateKey } from '@nangohq/types';

describe('createConnectSession', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('validates, inserts, creates a private key, and returns transport-neutral data', async () => {
        const expiresAt = new Date('2026-01-01T00:30:00.000Z');
        const { trx, insert } = mockTransaction();
        vi.spyOn(hooks, 'connectionCreationStartCapCheck').mockResolvedValue({ capped: false });
        vi.spyOn(configService, 'listProviderConfigs').mockResolvedValue([{ unique_key: 'github' }] as any);
        vi.spyOn(logs.logContextGetter, 'create').mockResolvedValue({ id: 'operation-id' } as any);
        const keySpy = vi.spyOn(keystore, 'createPrivateKey').mockResolvedValue(Ok(['session-token', privateKeyFixture(expiresAt)]));

        const result = await createConnectSession({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: planFixture(),
            endUser: {
                endUserId: 'end-user-id',
                email: 'user@example.com',
                displayName: 'End User',
                tags: { Tier: 'enterprise' },
                organization: { organizationId: 'acme', displayName: 'Acme' }
            },
            tags: { custom: 'value' },
            allowedIntegrations: ['github'],
            integrationsConfigDefaults: { github: { connectionConfig: { subdomain: 'acme' } } },
            overrides: { github: {} },
            webhookUrlOverride: 'https://example.com/webhook'
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                token: 'session-token',
                connectLink: expect.stringContaining('session-token'),
                expiresAt
            });
        }
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                account_id: 1,
                environment_id: 42,
                operation_id: 'operation-id',
                allowed_integrations: ['github'],
                tags: {
                    end_user_id: 'end-user-id',
                    end_user_email: 'user@example.com',
                    end_user_display_name: 'End User',
                    organization_id: 'acme',
                    organization_display_name: 'Acme',
                    tier: 'enterprise',
                    custom: 'value'
                }
            })
        );
        expect(keySpy).toHaveBeenCalledWith(trx, {
            displayName: '',
            accountId: 1,
            environmentId: 42,
            entityType: 'connect_session',
            entityId: 10,
            ttlInMs: 30 * 60 * 1000
        });
    });

    it('returns all missing integration references before opening a transaction', async () => {
        vi.spyOn(configService, 'listProviderConfigs').mockResolvedValue([{ unique_key: 'github' }] as any);
        const transactionSpy = vi.spyOn(db.knex, 'transaction');

        const result = await createConnectSession({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            endUser: null,
            tags: { team: 'platform' },
            allowedIntegrations: ['missing-one'],
            integrationsConfigDefaults: { 'missing-two': {} },
            overrides: { 'missing-three': {} }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'integration_not_found',
                missingIntegrations: [
                    { integrationId: 'missing-one', source: 'allowedIntegrations', index: 0 },
                    { integrationId: 'missing-two', source: 'integrationsConfigDefaults' },
                    { integrationId: 'missing-three', source: 'overrides' }
                ]
            });
        }
        expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('enforces connection caps before creating a session', async () => {
        vi.spyOn(hooks, 'connectionCreationStartCapCheck').mockResolvedValue({ capped: true });
        const transactionSpy = vi.spyOn(db.knex, 'transaction');

        const result = await createConnectSession({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: planFixture(),
            endUser: null,
            tags: { team: 'platform' }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('resource_capped');
        }
        expect(transactionSpy).not.toHaveBeenCalled();
    });

    it('enforces the docs Connect override plan entitlement', async () => {
        vi.spyOn(hooks, 'connectionCreationStartCapCheck').mockResolvedValue({ capped: false });
        vi.spyOn(configService, 'listProviderConfigs').mockResolvedValue([{ unique_key: 'github' }] as any);

        const result = await createConnectSession({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: planFixture({ can_override_docs_connect_url: false }),
            endUser: null,
            tags: { team: 'platform' },
            overrides: { github: { docs_connect: 'https://example.com/docs' } }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('docs_connect_override_forbidden');
        }
    });

    it('aborts the transaction when private-key creation fails', async () => {
        let transactionRolledBack = false;
        mockTransaction({
            onError: () => {
                transactionRolledBack = true;
            }
        });
        vi.spyOn(logs.logContextGetter, 'create').mockResolvedValue({ id: 'operation-id' } as any);
        vi.spyOn(keystore, 'createPrivateKey').mockResolvedValue(Err(new Error('keystore failed')) as any);

        const result = await createConnectSession({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            endUser: null,
            tags: { team: 'platform' }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('token_creation_failed');
        }
        expect(transactionRolledBack).toBe(true);
    });
});

function mockTransaction({ onError }: { onError?: (() => void) | undefined } = {}) {
    const returning = vi.fn().mockResolvedValue([
        {
            id: 10,
            end_user_id: null,
            account_id: 1,
            environment_id: 42,
            connection_id: null,
            operation_id: 'operation-id',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: null,
            allowed_integrations: ['github'],
            integrations_config_defaults: null,
            overrides: null,
            webhook_url_override: null,
            end_user: null,
            tags: {}
        }
    ]);
    const into = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ into }));
    const trx = { insert };
    vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
        try {
            return await callback(trx);
        } catch (err) {
            onError?.();
            throw err;
        }
    });
    return { trx, insert };
}

function accountFixture(): DBTeam {
    return { id: 1 } as DBTeam;
}

function environmentFixture(): DBEnvironment {
    return { id: 42 } as DBEnvironment;
}

function planFixture(overrides: Partial<DBPlan> = {}): DBPlan {
    return { connections_max: null, can_override_docs_connect_url: true, ...overrides } as DBPlan;
}

function privateKeyFixture(expiresAt: Date): PrivateKey {
    return { id: 1, expiresAt } as PrivateKey;
}
