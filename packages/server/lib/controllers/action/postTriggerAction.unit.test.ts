import { describe, expect, it } from 'vitest';

import { schemaBody } from './postTriggerAction.js';

describe('postTriggerAction schemaBody', () => {
    it('should accept a body without input', () => {
        const result = schemaBody.safeParse({ action_name: 'list-warehouses' });

        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({ action_name: 'list-warehouses' });
    });

    it('should accept any input', () => {
        for (const input of [null, {}, 'value', 1, [{ id: 1 }]]) {
            expect(schemaBody.safeParse({ action_name: 'list-warehouses', input }).success).toBe(true);
        }
    });

    it('should reject a body without action_name', () => {
        expect(schemaBody.safeParse({ input: {} }).success).toBe(false);
    });

    it('should reject an empty body', () => {
        expect(schemaBody.safeParse({}).success).toBe(false);
        expect(schemaBody.safeParse(undefined).success).toBe(false);
    });
});
