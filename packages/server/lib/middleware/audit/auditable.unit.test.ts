import { describe, expect, it, vi } from 'vitest';

import { resolveActor } from './auditable.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('resolveActor (unit)', () => {
    const account = { id: 42, uuid: 'acc-uuid' };

    it('resolves to unknown when no authType was set', () => {
        expect(resolveActor({ authType: undefined, account } as any)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });

    it('names a customer key by its uuid, the same identifier an api_key target carries', () => {
        expect(
            resolveActor({
                authType: 'secretKey',
                account,
                apiKeyId: 2551,
                apiKeyUuid: 'a2f1c0de-0000-4000-8000-000000000001',
                apiKeyDisplayName: 'ci-key'
            } as any)
        ).toEqual({ type: 'api_key', id: 'a2f1c0de-0000-4000-8000-000000000001', display: 'ci-key' });
    });

    // A sandbox token is minted from a customer key and carries that key's id, as it did before uuids.
    it('attributes a sandbox token to the key it was derived from', () => {
        expect(
            resolveActor({
                authType: 'secretKey',
                account,
                apiKeyAuthSource: 'sandbox_token',
                apiKeyId: 2551,
                apiKeyUuid: 'a2f1c0de-0000-4000-8000-000000000001'
            } as any)
        ).toEqual({ type: 'api_key', id: 'a2f1c0de-0000-4000-8000-000000000001' });
    });

    it('falls back to the internal id for api_secret and env_var auth, which have no key row', () => {
        expect(resolveActor({ authType: 'secretKey', account, apiKeyId: 2551 } as any)).toEqual({ type: 'api_key', id: '2551' });
    });

    it('names no key at all when neither identifier is present', () => {
        expect(resolveActor({ authType: 'secretKey', account } as any)).toEqual({ type: 'api_key', id: 'secret_key' });
    });

    it('resolves a public key to the public_key type with an unknown id', () => {
        expect(resolveActor({ authType: 'publicKey', account } as any)).toEqual({ type: 'public_key', id: 'unknown' });
    });

    it('names the end user behind a connect session, with their email as display', () => {
        const endUser = { endUserId: 'customer-user-1', email: 'buyer@customer.com', tags: null };
        expect(resolveActor({ authType: 'connectSession', account, endUser } as any)).toEqual({
            type: 'connect_session',
            id: 'customer-user-1',
            display: 'buyer@customer.com'
        });
    });

    // No display, so the dashboard renders "connect_session unknown" rather than hiding the mechanism.
    it('names the mechanism but nobody when a connect session carries no end user', () => {
        expect(resolveActor({ authType: 'connectSession', account } as any)).toEqual({ type: 'connect_session', id: 'unknown' });
    });

    // An auth type nothing maps must say we could not attribute it, never that nobody authenticated.
    it('is unknown for an auth type nothing maps, with no user to name', () => {
        expect(resolveActor({ authType: 'adminKey', account } as any)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });

    it.each(['basic', 'none'] as const)('names the dashboard user behind authType %s', (authType) => {
        expect(resolveActor({ authType, account, user: { id: 7, email: 'dev@example.com' } } as any)).toEqual({
            type: 'user',
            id: '7',
            display: 'dev@example.com'
        });
    });
});
