import { describe, expect, it } from 'vitest';

import { signupAcquisitionSchema } from '../../../../utils/signupAcquisition.js';
import { encodeManagedAuthState, parseManagedAuthState } from './auth.js';

describe('managed authentication continuation state', () => {
    it('preserves first source through Google signup', () => {
        const acquisition = { acquisition_utm_source: 'facebook', acquisition_landing_path: '/' };
        expect(parseManagedAuthState(encodeManagedAuthState({ acquisition, returnTo: '/onboarding' }))).toEqual({ acquisition, returnTo: '/onboarding' });
    });

    it('keeps the continuation when accepted Unicode analytics exceed the encoded state limit', () => {
        // Unpaired surrogates expand to six-byte JSON escapes while satisfying string length limits.
        const campaign = '\ud800'.repeat(256);
        const acquisition = signupAcquisitionSchema.parse({
            acquisition_utm_source: campaign,
            acquisition_utm_medium: campaign,
            acquisition_utm_campaign: campaign,
            acquisition_utm_content: campaign,
            acquisition_utm_term: campaign,
            acquisition_landing_path: `/${'\ud800'.repeat(1023)}`
        });
        expect(acquisition).toBeDefined();
        const state = { acquisition, returnTo: '/oauth/consent/interaction-id/review' };
        expect(Buffer.from(JSON.stringify(state)).toString('base64').length).toBeGreaterThan(16384);
        const encoded = encodeManagedAuthState(state);
        expect(encoded.length).toBeLessThanOrEqual(16384);
        expect(parseManagedAuthState(encoded)).toEqual({ returnTo: state.returnTo });
        expect(encodeManagedAuthState({ acquisition })).toBe('');
    });

    it('bounds accepted state when the optional destination needs JSON escaping', () => {
        const campaign = '界'.repeat(256);
        const acquisition = signupAcquisitionSchema.parse({
            acquisition_utm_source: campaign,
            acquisition_utm_medium: campaign,
            acquisition_utm_campaign: campaign,
            acquisition_utm_content: campaign,
            acquisition_utm_term: campaign,
            acquisition_landing_path: `/${'界'.repeat(1023)}`
        });
        const returnTo = `/${'\u0000'.repeat(1023)}`;
        const state = { acquisition, returnTo };
        expect(Buffer.from(JSON.stringify(state)).toString('base64').length).toBeGreaterThan(16384);
        const encoded = encodeManagedAuthState(state);
        expect(encoded.length).toBeLessThanOrEqual(16384);
        expect(parseManagedAuthState(encoded)).toEqual({ returnTo: '/' });
    });

    it('carries optional analytics without deciding account attribution in OAuth state', () => {
        const state = { token: 'invite', acquisition: { acquisition_utm_source: 'facebook' } };
        expect(parseManagedAuthState(encodeManagedAuthState(state))).toEqual(state);
        expect(parseManagedAuthState(Buffer.from(JSON.stringify(state)).toString('base64'))).toEqual(state);
    });

    it('keeps the continuation when optional analytics are malformed', () => {
        const state = { returnTo: '/onboarding', acquisition: { acquisition_utm_source: 42 } };
        expect(parseManagedAuthState(Buffer.from(JSON.stringify(state)).toString('base64'))).toEqual({ returnTo: '/onboarding' });
        expect(parseManagedAuthState('x'.repeat(16385))).toBeNull();
    });

    it('keeps valid analytics fields through Google state when another is invalid', () => {
        const state = { acquisition: { acquisition_utm_source: 'facebook', acquisition_referring_domain: 'my_blog.example.com' }, returnTo: '/onboarding' };
        expect(parseManagedAuthState(encodeManagedAuthState(state))).toEqual({ acquisition: { acquisition_utm_source: 'facebook' }, returnTo: '/onboarding' });
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
