import { describe, expect, it } from 'vitest';

import { buildInvitePrefillUrl, sanitizeEmailSubject } from './email.js';

describe('sanitizeEmailSubject', () => {
    it('removes carriage returns and line feeds from email subject values', () => {
        expect(sanitizeEmailSubject('Requester\r\nBcc: attacker@example.com\nAccount')).toBe('Requester Bcc: attacker@example.com Account');
    });
});

describe('buildInvitePrefillUrl', () => {
    it('percent-encodes the email so plus addressing is not read back as a space', () => {
        expect(buildInvitePrefillUrl('user+tag@example.com')).toContain('invite_email=user%2Btag%40example.com');
    });

    it.each(['user+tag@example.com', "o'brien@example.com", 'Firstname.Lastname@Example.com'])('round-trips %s', (email) => {
        expect(new URL(buildInvitePrefillUrl(email)).searchParams.get('invite_email')).toBe(email);
    });
});
