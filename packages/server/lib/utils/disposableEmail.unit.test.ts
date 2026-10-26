import { describe, expect, it } from 'vitest';

import { isDisposableEmail } from './disposableEmail.js';

describe('isDisposableEmail', () => {
    it.each(['a@1secmail.net', 'a@mailinator.com', 'a@maxxspace.com', 'a@MaxxSpace.COM', 'a@inbox.guerrillamailblock.com'])('flags %s', (email) => {
        expect(isDisposableEmail(email)).toBe(true);
    });

    it.each(['a@gmail.com', 'a@nango.dev', 'a@nangomailinator.com', 'a@mailinator.nango.dev', 'a@com', 'a'])('allows %s', (email) => {
        expect(isDisposableEmail(email)).toBe(false);
    });
});
