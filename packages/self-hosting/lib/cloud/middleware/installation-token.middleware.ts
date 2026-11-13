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

export type InstallationTokenApiErrorCode = InstallationTokenErrorCode | 'missing_token' | 'body_mismatch';

const STATUS: Partial<Record<InstallationTokenErrorCode, number>> = {
    malformed: 401,
    unknown_key: 401,
    invalid_signature: 401,
    clock_skew: 401,
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

/** Runs before the body is read, so we only read the body of a request that has a valid token. */
export const installationTokenMiddleware =
    (db: RegistryDb) =>
    async (req: Request, res: Response<ApiError<InstallationTokenApiErrorCode>>, next: NextFunction): Promise<void> => {
        const token = bearer(req.get('authorization'));
        if (!token) {
            sendError(res, { status: 401, code: 'missing_token', message: 'an installation token is required' });
            return;
        }
        const verified = await verifyInstallationToken(db, { token });
        if (verified.isErr()) {
            const { code, message, cause } = verified.error;
            sendError(res, { status: STATUS[code] ?? 500, code, message, context: { kid: claimedKid(req) }, cause });
            return;
        }
        const { installation, bodySha256 } = verified.value;
        tracer.setUser({ id: installation.uuid, name: installation.name });
        res.locals['installation'] = installation;
        res.locals['tokenBodySha256'] = bodySha256;
        next();
    };

/** Runs after the body is read as it was sent: the token is only good for those bytes. */
export function installationTokenBodyMiddleware(req: Request, res: Response<ApiError<InstallationTokenApiErrorCode>>, next: NextFunction): void {
    if (digestBody(requestBody(req)) !== res.locals['tokenBodySha256']) {
        sendError(res, { status: 401, code: 'body_mismatch', message: 'token was not minted for this request body', context: { kid: claimedKid(req) } });
        return;
    }
    next();
}
