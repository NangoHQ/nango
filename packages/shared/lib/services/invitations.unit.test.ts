import { describe, expect, it } from 'vitest';

import { enterpriseAdminInvite, validateInvitation } from './invitations.js';

import type { DBInvitation } from '@nangohq/types';

function invitation(overrides: Partial<DBInvitation> = {}): DBInvitation {
    const now = new Date();
    return {
        id: 1,
        email: 'invitee@example.com',
        name: 'Invitee',
        account_id: 1,
        invited_by: 1,
        token: 'invite-token',
        expires_at: now,
        accepted: false,
        created_at: now,
        updated_at: now,
        role: 'administrator',
        ...overrides
    };
}

describe('validateInvitation', () => {
    it('accepts a case-insensitive email match', () => {
        const result = validateInvitation(invitation(), 'Invitee@Example.com');

        expect(result.isOk()).toBe(true);
    });

    it.each([
        ['the invitation is missing', null],
        ['the invitation email does not match', invitation()]
    ])('returns a standard not-found error when %s', (_, invalidInvitation) => {
        const result = validateInvitation(invalidInvitation, 'other@example.com');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'not_found', message: 'Invitation does not exist or is expired' });
        }
    });

    it('accepts the shared enterprise administrator invitation for any email', () => {
        const result = validateInvitation(enterpriseAdminInvite, 'admin@example.com');

        expect(result.isOk()).toBe(true);
    });

    it('does not accept a persisted invitation that resembles the enterprise administrator invitation', () => {
        const persistedInvitation: DBInvitation = {
            ...enterpriseAdminInvite,
            expires_at: new Date(enterpriseAdminInvite.expires_at),
            created_at: new Date(enterpriseAdminInvite.created_at),
            updated_at: new Date(enterpriseAdminInvite.updated_at)
        };
        const result = validateInvitation(persistedInvitation, 'admin@example.com');

        expect(result.isErr()).toBe(true);
    });
});
