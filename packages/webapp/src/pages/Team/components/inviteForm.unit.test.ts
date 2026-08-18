import { describe, expect, it } from 'vitest';

import { inviteSchema, parseInvitePrefillEmail } from './inviteForm';

describe('parseInvitePrefillEmail', () => {
    it('keeps a valid address as-is, including plus addressing and casing', () => {
        expect(parseInvitePrefillEmail('User+tag@Example.com')).toBe('User+tag@Example.com');
    });

    it('trims surrounding whitespace', () => {
        expect(parseInvitePrefillEmail('  a@b.com  ')).toBe('a@b.com');
    });

    it.each([
        ['null', null],
        ['empty string', ''],
        ['whitespace only', '   '],
        ['not an email', 'not-an-email'],
        ['markup', '<script>alert(1)</script>'],
        ['a list of emails', 'a@b.com, c@d.com'],
        ['an address over 255 chars', `${'a'.repeat(250)}@example.com`]
    ])('rejects %s', (_label, input) => {
        expect(parseInvitePrefillEmail(input)).toBe('');
    });
});

describe('inviteSchema', () => {
    it('accepts distinct emails', () => {
        const res = inviteSchema.safeParse({
            invites: [
                { email: 'a@b.com', role: 'administrator' },
                { email: 'c@d.com', role: 'production_support' }
            ]
        });
        expect(res.success).toBe(true);
    });

    it('flags a case-insensitive duplicate on the later row', () => {
        const res = inviteSchema.safeParse({
            invites: [
                { email: 'a@b.com', role: 'administrator' },
                { email: 'A@B.com', role: 'administrator' }
            ]
        });
        expect(res.success).toBe(false);
        expect(res.error?.issues[0]?.path).toEqual(['invites', 1, 'email']);
    });

    it('rejects an empty invite list', () => {
        expect(inviteSchema.safeParse({ invites: [] }).success).toBe(false);
    });
});
