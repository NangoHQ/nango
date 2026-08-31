import { describe, expect, it, vi } from 'vitest';

import { resolveActor } from './auditable.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('resolveActor (unit)', () => {
    const account = { id: 42, uuid: 'acc-uuid' };

    it('is unknown for a caller no middleware attributed', () => {
        expect(resolveActor({ authType: undefined, account } as any)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });

    // Same shape as a connect session that carries no end user: the mechanism is known, the person is not.
    it('names the mechanism but nobody for the deprecated public-key flow', () => {
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
