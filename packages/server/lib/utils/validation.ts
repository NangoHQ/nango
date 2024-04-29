import { z } from 'zod';

import type { Request } from 'express';

export function zodErrorToHTTP(error: z.ZodError): { code: string; message: string; path: (string | number)[] }[] {
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
    if (!req.query) {
        return;
    }

    const val = z
        .object(withEnv ? { env: z.string().max(250).min(1) } : {})
        .strict()
        .safeParse(req.query);
    if (val.success) {
        return;
    }

    return val;
}
