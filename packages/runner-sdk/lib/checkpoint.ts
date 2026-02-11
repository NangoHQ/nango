import * as z from 'zod';

import type { Checkpoint } from '@nangohq/types';

/*
 * The checkpoint can contain date strings.
 * This function recursively checks the checkpoint object and converts any string that is a valid datetime to a Date object.
 */
export function validateCheckpoint(checkpoint: Checkpoint): Checkpoint {
    const validated: Checkpoint = {};
    for (const [key, value] of Object.entries(checkpoint)) {
        if (typeof value === 'string') {
            const parsed = z.string().datetime().safeParse(value);
            if (parsed.success) {
                validated[key] = new Date(value);
                continue;
            }
        }
        validated[key] = value;
    }
    return validated;
}
