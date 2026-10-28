import { describe, expect, it, vi } from 'vitest';

import { bodySchema } from './putTask.js';

vi.mock('../../execution/operations/handler.js', () => ({ handle: vi.fn() }));

const errorSchema = bodySchema.shape.error;

describe('putTask bodySchema error', () => {
    it('should default payload to an empty object when it is missing', () => {
        const result = errorSchema.safeParse({ type: 'function_internal_error', status: 500 });

        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({ type: 'function_internal_error', status: 500, payload: {} });
    });

    it('should keep an object payload', () => {
        const result = errorSchema.safeParse({ type: 'action_script_failure', status: 500, payload: { message: 'boom' } });

        expect(result.data?.payload).toStrictEqual({ message: 'boom' });
    });

    it('should wrap a non-object payload in a message', () => {
        const result = errorSchema.safeParse({ type: 'action_script_failure', status: 500, payload: 'boom' });

        expect(result.data?.payload).toStrictEqual({ message: 'boom' });
    });
});
