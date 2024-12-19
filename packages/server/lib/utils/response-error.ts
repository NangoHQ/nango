import type { Response } from 'express';
import tracer from 'dd-trace';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Server.ResponseError');

interface ErrorMessage {
    code: string;
    message?: string;
}

export function serverError(res: Response, error: ErrorMessage, status = 500): void {
    logger.error('Server error', error);

    const active = tracer.scope().active();
    active?.setTag('errorCode', error.code);
    if (error.message) {
        active?.setTag('errorMessage', error.message);
    }

    res.status(status).send({
        error
    });
}
