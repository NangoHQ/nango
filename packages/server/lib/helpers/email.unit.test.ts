import { describe, expect, it } from 'vitest';

import { sanitizeEmailSubject } from './email.js';

describe('sanitizeEmailSubject', () => {
    it('removes carriage returns and line feeds from email subject values', () => {
        expect(sanitizeEmailSubject('Requester\r\nBcc: attacker@example.com\nAccount')).toBe('Requester Bcc: attacker@example.com Account');
    });
});
