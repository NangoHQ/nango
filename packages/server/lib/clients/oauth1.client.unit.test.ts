import { describe, expect, it } from 'vitest';
import { extractQueryParams } from './oauth1.client';

describe('oauth1', () => {
    it('should extract query params', () => {
        const res = extractQueryParams('baz=bar&foo=bar');
        expect(Object.fromEntries(res)).toStrictEqual({ baz: 'bar', foo: 'bar' });
    });
    it('should extract undefined query params', () => {
        const res = extractQueryParams(undefined);
        expect(Object.fromEntries(res)).toStrictEqual({});
    });
});
