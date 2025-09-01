import { describe, expect, it } from 'vitest';

import { stringifyStable } from '@nangohq/utils';

import { getSignatureHeader } from './utils.js';

describe('getSignatureHeader', () => {
    it('should return a string', () => {
        const secret = 'secret';
        const payload = 'payload';
        const signature = getSignatureHeader(secret, payload);
        expect(signature).toBe('22439a879b090cd05e5b51c5b5d7e4a205830e6ab4f54b90f5a822b7c7110934');
    });

    it('should return the same signature for the same payload but different order', () => {
        const secret = 'secret';
        const signature1 = getSignatureHeader(secret, stringifyStable({ a: 1, b: 2 }).unwrap());
        const signature2 = getSignatureHeader(secret, stringifyStable({ b: 2, a: 1 }).unwrap());
        expect(signature1).toBe(signature2);
    });
});
