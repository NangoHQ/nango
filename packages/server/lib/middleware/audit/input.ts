import { validate as isUuid } from 'uuid';

import type { Request } from 'express';

export function param(req: Request<any, any, any, any>, key: string): unknown {
    return (req.params as Record<string, unknown>)[key];
}

export function query(req: Request<any, any, any, any>, key: string): unknown {
    return (req.query as Record<string, unknown>)[key];
}

export function bodyField(req: Request<any, any, any, any>, key: string): unknown {
    return (req.body as Record<string, unknown> | undefined)?.[key];
}

/** Resolvers run before the controller validates, so a field the endpoint types as a string can hold anything. */
export function positiveInt(value: unknown): number | undefined {
    const parsed = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function uuid(value: unknown): string | undefined {
    return typeof value === 'string' && isUuid(value) ? value : undefined;
}

export function omitUndefined<T extends object>(obj: { [K in keyof T]?: T[K] | undefined }): T | undefined {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            out[key] = value;
        }
    }
    // T comes from the caller's declared metadata type, so dropping the undefined keys leaves a T.
    return Object.keys(out).length > 0 ? (out as T) : undefined;
}
