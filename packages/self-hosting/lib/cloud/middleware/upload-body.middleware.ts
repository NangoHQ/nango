import express from 'express';

import { TELEMETRY_UPLOAD_MAX_BODY_BYTES } from '../uploads/constants.js';
import { sendUploadError } from '../uploads/errors.js';
import { claimedKid } from './installation-token.middleware.js';

import type { UploadApiErrorCode } from '../uploads/errors.js';
import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const raw = express.raw({ type: () => true, limit: TELEMETRY_UPLOAD_MAX_BODY_BYTES, inflate: false });

/** Keeps the body as it was sent: the installation token is bound to those bytes. */
export function uploadBodyMiddleware(req: Request, res: Response<ApiError<UploadApiErrorCode>>, next: NextFunction): void {
    raw(req, res, (err?: unknown) => {
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
