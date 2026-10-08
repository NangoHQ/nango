import { describe, expect, it } from 'vitest';

import { encodeManagedAuthState, parseManagedAuthState } from './auth.js';

describe('managed authentication continuation state', () => {
    it('preserves first source through Google signup', () => {
        const acquisition = { acquisition_utm_source: 'facebook', acquisition_landing_path: '/' };
        expect(parseManagedAuthState(encodeManagedAuthState({ acquisition, returnTo: '/onboarding' }))).toEqual({ acquisition, returnTo: '/onboarding' });
    });

    it('never carries acquisition data into an invitation', () => {
        const state = { token: 'invite', acquisition: { acquisition_utm_source: 'facebook' } };
        expect(parseManagedAuthState(encodeManagedAuthState(state))).toEqual({ token: 'invite' });
        expect(parseManagedAuthState(Buffer.from(JSON.stringify(state)).toString('base64'))).toEqual({ token: 'invite' });
    });

    it('keeps the continuation when optional analytics are malformed', () => {
        const state = { returnTo: '/onboarding', acquisition: { acquisition_utm_source: 42 } };
        expect(parseManagedAuthState(Buffer.from(JSON.stringify(state)).toString('base64'))).toEqual({ returnTo: '/onboarding' });
        expect(parseManagedAuthState('x'.repeat(16385))).toBeNull();
    });

    it('preserves a safe OAuth consent continuation', () => {
        const state = Buffer.from(JSON.stringify({ returnTo: '/oauth/consent/interaction-id/review' })).toString('base64');
        expect(parseManagedAuthState(state)).toEqual({ returnTo: '/oauth/consent/interaction-id/review' });
    });

    it('decodes UTF-8 continuations without corrupting the path', () => {
        const state = Buffer.from(JSON.stringify({ returnTo: '/oauth/consent/café/review' })).toString('base64');
        expect(parseManagedAuthState(state)).toEqual({ returnTo: '/oauth/consent/caf%C3%A9/review' });
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
