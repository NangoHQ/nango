import * as z from 'zod';

import type { Checkpoint } from '@nangohq/types';

export const checkpointSchema = z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.date()]).transform((d) => {
        if (typeof d === 'string' && z.string().datetime().safeParse(d).success) {
            return new Date(d);
        }
        return d;
    })
);

/*
 * Runtime validtion for checkpoints.
 * Checkpoints must be an object with string keys and values that are either strings, numbers, booleans, or ISO date strings.
 */
export function validateCheckpoint(sample: Checkpoint): Checkpoint {
    const result = checkpointSchema.safeParse(sample);
    if (!result.success) {
        throw new Error(`Invalid checkpoint: ${result.error.message}`);
    }
    return result.data;
}
