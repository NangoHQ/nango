import * as z from 'zod';

import type { Checkpoint } from '@nangohq/types';

export const checkpointSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

/*
 * Runtime validation for checkpoints.
 * Checkpoints must be an object with string keys and values that are either strings, numbers or booleans.
 */
export function validateCheckpoint(data: any): Checkpoint {
    const result = checkpointSchema.safeParse(data);
    if (!result.success) {
        throw new Error(`Invalid checkpoint: ${result.error.message}`);
    }
    return result.data;
}
