import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { generateInlineFunctionUuid, isInlineFunctionUuid } from './inlineFunctionUuid.js';

describe('inline function uuid', () => {
    it('generates a valid uuid that is recognised as inline and differs on every call', () => {
        const uuid = generateInlineFunctionUuid();

        expect(z.uuid().safeParse(uuid).success).toBe(true);
        expect(isInlineFunctionUuid(uuid)).toBe(true);
        expect(generateInlineFunctionUuid()).not.toBe(uuid);
    });

    it.each(['11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', '1c0de000', undefined])(
        'does not recognise %s as inline',
        (value) => {
            expect(isInlineFunctionUuid(value)).toBe(false);
        }
    );
});
