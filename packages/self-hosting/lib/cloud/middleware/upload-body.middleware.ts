import express from 'express';

import { TELEMETRY_UPLOAD_MAX_BODY_BYTES } from '../uploads/constants.js';
import { sendUploadError } from '../uploads/errors.js';
import { claimedKid } from './installation-token.middleware.js';

import type { UploadApiErrorCode } from '../uploads/errors.js';
import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const readBody = express.raw({ type: () => true, limit: TELEMETRY_UPLOAD_MAX_BODY_BYTES, inflate: false });

/**
 * Reads the body exactly as it was sent, which is what the installation token is verified against, and answers
 * early when reading fails.
 */
export function readUploadBodyMiddleware(req: Request, res: Response<ApiError<UploadApiErrorCode>>, next: NextFunction): void {
    readBody(req, res, (err?: unknown) => {
        const failure = typeof err === 'object' && err !== null ? err : {};
        const type = 'type' in failure ? failure.type : undefined;
        const status = 'status' in failure ? failure.status : undefined;
        if (type === 'entity.too.large') {
            sendUploadError(res, 'request_too_large', `an upload holds at most ${TELEMETRY_UPLOAD_MAX_BODY_BYTES} bytes`, { kid: claimedKid(req) });
        } else if (type === 'encoding.unsupported') {
            sendUploadError(res, 'invalid_encoding', 'the body must be sent as it is, without a content encoding', { kid: claimedKid(req) });
        } else if (typeof status === 'number' && status >= 400 && status < 500) {
            sendUploadError(res, 'invalid_body', 'the body could not be read', { kid: claimedKid(req) });
        } else {
            next(err);
        }
    });
}
