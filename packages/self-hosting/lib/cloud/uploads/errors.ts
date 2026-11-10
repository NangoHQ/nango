import { sendError } from '../errors.js';

import type { UploadErrorCode } from './reader.js';
import type { ApiError } from '@nangohq/types';
import type { Response } from 'express';

export type UploadApiErrorCode = UploadErrorCode | 'installation_mismatch' | 'insert_failed';

const STATUS: Partial<Record<UploadApiErrorCode, number>> = {
    installation_mismatch: 403,
    invalid_encoding: 400,
    invalid_header: 400,
    invalid_row: 400,
    request_too_large: 413,
    too_many_rows: 413
};

export function sendUploadError(
    res: Response<ApiError<UploadApiErrorCode>>,
    code: UploadApiErrorCode,
    message: string,
    { cause, ...context }: { installationId?: string; kid?: string | undefined; cause?: unknown } = {}
): void {
    sendError(res, { status: STATUS[code] ?? 500, code, message, context, cause });
}
