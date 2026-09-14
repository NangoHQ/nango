import { describe, expect, it } from 'vitest';

import { parseManagedAuthState } from './auth.js';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

describe('parseManagedAuthState', () => {
    it('parses a state carrying only an invitation token', () => {
        expect(parseManagedAuthState(encode({ token: 'a-token' }))).toEqual({ token: 'a-token' });
    });

    it('parses a state carrying only a destination', () => {
        expect(parseManagedAuthState(encode({ returnTo: '/team/billing' }))).toEqual({ returnTo: '/team/billing' });
    });

    it('parses a state carrying both', () => {
        expect(parseManagedAuthState(encode({ token: 'a-token', returnTo: '/team/billing' }))).toEqual({
            token: 'a-token',
            returnTo: '/team/billing'
        });
    });

    it('rejects a state with neither field', () => {
        expect(parseManagedAuthState(encode({ other: 'value' }))).toBeNull();
        expect(parseManagedAuthState(encode({}))).toBeNull();
    });

    it('rejects non-string fields', () => {
        expect(parseManagedAuthState(encode({ token: 1 }))).toBeNull();
        expect(parseManagedAuthState(encode({ returnTo: ['/team/billing'] }))).toBeNull();
        expect(parseManagedAuthState(encode({ token: 'a-token', returnTo: { pathname: '/' } }))).toBeNull();
    });

    it('rejects values that are not an encoded object', () => {
        expect(parseManagedAuthState('')).toBeNull();
        expect(parseManagedAuthState('not-base64-json')).toBeNull();
        expect(parseManagedAuthState(encode('a-token'))).toBeNull();
        expect(parseManagedAuthState(encode(null))).toBeNull();
    });

    it('rejects an oversized state', () => {
        expect(parseManagedAuthState(encode({ returnTo: `/dev/logs?filters=${'a'.repeat(4096)}` }))).toBeNull();
    });
});
