import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { prefixedUuidV8 } from './uuid.js';

describe('prefixedUuidV8', () => {
    const uuids = prefixedUuidV8('0123abcd');

    it('builds a valid version 8 uuid that starts with the prefix', () => {
        const uuid = uuids.fromBytes(randomBytes(16));

        expect(z.uuid().safeParse(uuid).success).toBe(true);
        expect(uuid).toMatch(/^0123abcd-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab]/);
        expect(uuids.matches(uuid)).toBe(true);
    });

    it('builds the same uuid from the same bytes', () => {
        const bytes = randomBytes(32);

        expect(uuids.fromBytes(bytes)).toBe(uuids.fromBytes(bytes));
    });

    it('only matches lower case', () => {
        expect(uuids.matches(uuids.fromBytes(randomBytes(16)).toUpperCase())).toBe(false);
    });

    it.each(['0123abcd-1111-4111-8111-111111111111', 'ffffffff-1111-8111-8111-111111111111', '0123abcd', undefined])('does not match %s', (value) => {
        expect(uuids.matches(value)).toBe(false);
    });

    it.each(['0123ABCD', '0123abc', 'not-hex!'])('rejects the prefix %s', (prefix) => {
        expect(() => prefixedUuidV8(prefix)).toThrow();
    });
});
