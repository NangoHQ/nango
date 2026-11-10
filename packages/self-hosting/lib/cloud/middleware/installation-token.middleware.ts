import tracer from 'dd-trace';
import { decodeProtectedHeader } from 'jose';

import { digestBody } from '../../installation/token.js';
import { sendError } from '../errors.js';
import { verifyInstallationToken } from '../services/installation-token.service.js';

import type { RegistryDb } from '../services/db.js';
import type { InstallationTokenErrorCode } from '../services/installation-token.service.js';
import type { ApiError, DBSelfHostingInstallation } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export interface InstallationLocals {
    installation: DBSelfHostingInstallation;
}

export type InstallationTokenApiErrorCode = InstallationTokenErrorCode | 'missing_token';

const STATUS: Partial<Record<InstallationTokenErrorCode, number>> = {
    malformed: 401,
    unknown_key: 401,
    invalid_signature: 401,
    clock_skew: 401,
    body_mismatch: 401,
    no_installation: 403,
    no_license: 403,
    license_expired: 403
};

export function requestBody(req: { body?: unknown }): Buffer {
    return Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
}

function bearer(header: string | undefined): string | undefined {
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

/** Read without verifying, only to say in the log which key a failed request claims to be from. */
export function claimedKid(req: Request): string | undefined {
    try {
        return decodeProtectedHeader(bearer(req.get('authorization')) ?? '').kid;
    } catch {
        return undefined;
    }
}

/** Runs after the body is read as it was sent: the token is bound to those bytes. */
export const installationTokenMiddleware =
    (db: RegistryDb) =>
    async (req: Request, res: Response<ApiError<InstallationTokenApiErrorCode>>, next: NextFunction): Promise<void> => {
        const token = bearer(req.get('authorization'));
        if (!token) {
            sendError(res, { status: 401, code: 'missing_token', message: 'an installation token is required' });
            return;
        }
        const verified = await verifyInstallationToken(db, { token, bodySha256: digestBody(requestBody(req)) });
        if (verified.isErr()) {
            const { code, message, cause } = verified.error;
            sendError(res, { status: STATUS[code] ?? 500, code, message, context: { kid: claimedKid(req) }, cause });
            return;
        }
        tracer.setUser({ id: verified.value.uuid, name: verified.value.name });
        res.locals['installation'] = verified.value;
        next();
    };
