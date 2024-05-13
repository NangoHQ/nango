import { z } from 'zod';

import type { Request } from 'express';
import type { ValidationError } from '@nangohq/types';

export function zodErrorToHTTP(error: z.ZodError): ValidationError[] {
    return error.issues.map(({ code, message, path }) => {
        return { code, message, path };
    });
}

/**
 * Enforce empty request body
 */
export function requireEmptyBody(req: Request) {
    if (!req.body) {
        return;
    }

    const val = z.object({}).strict().safeParse(req.body);
    if (val.success) {
        return;
    }

    return val;
}

/**
 * Enforce empty request query string
 */
export function requireEmptyQuery(req: Request, { withEnv }: { withEnv: boolean } = { withEnv: false }) {
    const val = z
        .object(withEnv ? { env: z.string().max(250).min(1) } : {})
        .strict()
        .safeParse(req.query);
    if (val.success) {
        return;
    }

    return val;
}
