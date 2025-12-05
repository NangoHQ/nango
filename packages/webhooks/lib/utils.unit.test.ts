import { describe, expect, it } from 'vitest';

import { stringifyStable } from '@nangohq/utils';

import { getHmacSignatureHeader, getSignatureHeaderUnsafe } from './utils.js';

describe('getSignatureHeaderUnsafe', () => {
    it('should return a string', () => {
        const secret = 'secret';
        const payload = 'payload';
        const signature = getSignatureHeaderUnsafe(secret, payload);
        expect(signature).toBe('22439a879b090cd05e5b51c5b5d7e4a205830e6ab4f54b90f5a822b7c7110934');
    });

    it('should return the same signature for the same payload but different order', () => {
        const secret = 'secret';
        const signature1 = getSignatureHeaderUnsafe(secret, stringifyStable({ a: 1, b: 2 }).unwrap());
        const signature2 = getSignatureHeaderUnsafe(secret, stringifyStable({ b: 2, a: 1 }).unwrap());
        expect(signature1).toBe(signature2);
    });
});

describe('getHmacSignatureHeader', () => {
    it('should return a string', () => {
        const secret = 'secret';
        const payload = 'payload';
        const signature = getHmacSignatureHeader(secret, payload);
        expect(signature).toBe('b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4');
    });

    it('should return the same signature for the same payload but different order', () => {
        const secret = 'secret';
        const signature1 = getHmacSignatureHeader(secret, stringifyStable({ a: 1, b: 2 }).unwrap());
        const signature2 = getHmacSignatureHeader(secret, stringifyStable({ b: 2, a: 1 }).unwrap());
        expect(signature1).toBe(signature2);
    });

    it('should return a different signature from getSignatureHeaderUnsafe', () => {
        const secret = 'secret';
        const payload = 'payload';
        const safeSignature = getHmacSignatureHeader(secret, payload);
        const unsafeSignature = getSignatureHeaderUnsafe(secret, payload);
        expect(safeSignature).not.toEqual(unsafeSignature);
    });
});
