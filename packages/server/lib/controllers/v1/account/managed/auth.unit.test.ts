import { describe, expect, it } from 'vitest';

import { encodeManagedAuthState, parseManagedAuthState } from './auth.js';

describe('managed authentication continuation state', () => {
    it('preserves a safe OAuth consent continuation', () => {
        const state = Buffer.from(JSON.stringify({ returnTo: '/oauth/consent/interaction-id' })).toString('base64');
        expect(parseManagedAuthState(state)).toEqual({ returnTo: '/oauth/consent/interaction-id' });
    });

    it('decodes UTF-8 continuations without corrupting the path', () => {
        const state = Buffer.from(JSON.stringify({ returnTo: '/oauth/consent/café' })).toString('base64');
        expect(parseManagedAuthState(state)).toEqual({ returnTo: '/oauth/consent/caf%C3%A9' });
    });

    it('gives invitation state precedence over a return path', () => {
        const token = '8a0de80f-4958-4575-9c25-1e8cf72bf576';
        expect(parseManagedAuthState(encodeManagedAuthState({ token, returnTo: `/signup/${token}` }))).toEqual({ token });
    });

    it('sanitizes external continuations and rejects malformed values', () => {
        const external = Buffer.from(JSON.stringify({ returnTo: 'https://attacker.example.com/collect' })).toString('base64');
        expect(parseManagedAuthState(external)).toEqual({ returnTo: '/' });
        expect(parseManagedAuthState(Buffer.from(JSON.stringify({ returnTo: 42 })).toString('base64'))).toBeNull();
        expect(parseManagedAuthState('not-base64-json')).toBeNull();
    });
});
