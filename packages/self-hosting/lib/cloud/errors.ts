import tracer from 'dd-trace';

import { logger } from '../utils.js';

import type { ApiError } from '@nangohq/types';
import type { Response } from 'express';

export function sendError<TCode extends string>(
    res: Response<ApiError<TCode>>,
    { status, code, message, context, cause }: { status: number; code: TCode; message: string; context?: Record<string, unknown>; cause?: unknown }
): void {
    const span = tracer.scope().active();
    span?.addTags({ 'nango.errorCode': code, 'nango.errorMessage': message });
    if (status >= 500) {
        span?.setTag('error', cause ?? new Error(`${code}: ${message}`));
    }
    logger[status >= 500 ? 'error' : 'warning'](`${code}: ${message}`, context, cause);
    res.status(status).json({ error: { code, message } });
}
