import type { Request, NextFunction } from 'express';
import { z } from 'zod';
import type { ValidationError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse } from './route.js';

interface RequestParser<E extends Endpoint<any>> {
    parseBody?: (data: unknown) => E['Body'];
    parseQuery?: (data: unknown) => E['Querystring'];
    parseParams?: (data: unknown) => E['Params'];
}

export const validateRequest =
    <E extends Endpoint<any>>(parser: RequestParser<E>) =>
    (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => {
        try {
            if (parser.parseBody) {
                parser.parseBody(req.body);
            } else {
                z.object({}).strict('Body is not allowed').parse(req.body);
            }
            if (parser.parseQuery) {
                parser.parseQuery(req.query);
            } else {
                z.object({}).strict('Query string parameters are not allowed').parse(req.query);
            }
            if (parser.parseParams) {
                parser.parseParams(req.params);
            } else {
                z.object({}).strict('Url parameters are not allowed').parse(req.params);
            }
            return next();
        } catch (error: unknown) {
            if (error instanceof z.ZodError) {
                res.status(400).send({ error: { code: 'invalid_request', errors: zodErrorToHTTP(error) } });
            }
        }
    };

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
