import { describe, expect, it } from 'vitest';

import { parseManagedAuthState } from './auth.js';

describe('managed authentication continuation state', () => {
    it('preserves a safe OAuth consent continuation', () => {
        const state = Buffer.from(JSON.stringify({ returnTo: '/oauth/consent/interaction-id' })).toString('base64');
        expect(parseManagedAuthState(state)).toEqual({ returnTo: '/oauth/consent/interaction-id' });
    });

    it('sanitizes external continuations and rejects malformed values', () => {
        const external = Buffer.from(JSON.stringify({ returnTo: 'https://attacker.example.com/collect' })).toString('base64');
        expect(parseManagedAuthState(external)).toEqual({ returnTo: '/' });
        expect(parseManagedAuthState(Buffer.from(JSON.stringify({ returnTo: 42 })).toString('base64'))).toBeNull();
        expect(parseManagedAuthState('not-base64-json')).toBeNull();
    });
});
