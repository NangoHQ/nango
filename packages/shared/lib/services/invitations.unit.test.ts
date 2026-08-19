import { describe, expect, it } from 'vitest';

import { validateInvitation } from './invitations.js';

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

    it('accepts the synthetic enterprise administrator invitation for any email', () => {
        const result = validateInvitation(invitation({ email: '', account_id: 0, invited_by: 0, token: '', accepted: true }), 'admin@example.com');

        expect(result.isOk()).toBe(true);
    });
});
