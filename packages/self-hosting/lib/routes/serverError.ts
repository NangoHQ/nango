import { logger } from '../utils.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export function serverError(err: unknown, _req: Request, res: Response<ApiError<'server_error'>>, _next: NextFunction): void {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: { code: 'server_error' } });
}
