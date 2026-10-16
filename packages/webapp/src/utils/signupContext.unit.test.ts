import { describe, expect, it } from 'vitest';

import { readSignupPath } from './signupContext';

describe('signup browser route', () => {
    it('recognizes public signup and signin routes only', () => {
        expect(readSignupPath('/signup/')).toBe('/signup');
        expect(readSignupPath('/signin')).toBe('/signin');
        for (const path of ['/signup/token', '/signup/verification/token', '/api/v1/login/callback', '/signup?token=secret', '//evil.test']) {
            expect(readSignupPath(path)).toBeUndefined();
        }
    });
});
