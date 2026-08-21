import { describe, expect, it } from 'vitest';

import { errorToObject } from './errorSerialize.js';

describe('errorToObject', () => {
    it('returns unknown error for null and undefined', () => {
        expect(errorToObject(null)).toEqual({ message: 'Unknown error' });
        expect(errorToObject(undefined)).toEqual({ message: 'Unknown error' });
    });

    it('preserves falsy primitive values', () => {
        expect(errorToObject(0)).toEqual({ message: '0' });
        expect(errorToObject(false)).toEqual({ message: 'false' });
        expect(errorToObject('')).toEqual({ message: '' });
    });

    it('serializes Error instances', () => {
        const err = new Error('boom');
        expect(errorToObject(err)).toMatchObject({ name: 'Error', message: 'boom' });
    });
});
