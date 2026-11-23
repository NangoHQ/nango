import { createHash, timingSafeEqual } from 'node:crypto';

import { sendError } from '../../cloud/errors.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const digest = (key: string) => createHash('sha256').update(key).digest();

/** Compares the digests of the two keys, so the comparison takes the same time whatever was sent. */
export const manualTelemetryExportKeyMiddleware =
    (key: string) =>
    (req: Request, res: Response<ApiError<'missing_key' | 'invalid_key'>>, next: NextFunction): void => {
        const [scheme, keySent] = req.get('authorization')?.split(' ') ?? [];
        if (scheme?.toLowerCase() !== 'bearer' || !keySent) {
            sendError(res, { status: 401, code: 'missing_key', message: 'an export key is required' });
            return;
        }
        if (!timingSafeEqual(digest(keySent), digest(key))) {
            sendError(res, { status: 401, code: 'invalid_key', message: 'the export key is not valid' });
            return;
        }
        next();
    };
