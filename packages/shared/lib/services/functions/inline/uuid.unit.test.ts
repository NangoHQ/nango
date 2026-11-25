import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { generateInlineFunctionUuid, isInlineFunctionUuid } from './uuid.js';

describe('inline function uuid', () => {
    it('generates a valid uuid that is recognised as inline and differs on every call', () => {
        const uuid = generateInlineFunctionUuid();

        expect(z.uuid().safeParse(uuid).success).toBe(true);
        expect(isInlineFunctionUuid(uuid)).toBe(true);
        expect(generateInlineFunctionUuid()).not.toBe(uuid);
    });

    it.each(['11111111-1111-4111-8111-111111111111', 'ca7a10c0-1111-8111-8111-111111111111', '1c0de000', undefined])(
        'does not recognise %s as inline',
        (value) => {
            expect(isInlineFunctionUuid(value)).toBe(false);
        }
    );
});
