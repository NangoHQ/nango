import db from '@nangohq/database';
import { FunctionError, remoteFunctionDryrunSandboxTimeoutMs, sandboxApiKeyService } from '@nangohq/sandbox';
import { stringifyError } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { FunctionDryrunError } from '@nangohq/sandbox';
import type { Response } from 'express';

export const defaultFunctionName = 'function';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;

export async function createDryrunSandboxApiKey(parentApiKeyId: number, environmentId: number, dryrunId?: string) {
    return await sandboxApiKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId,
        environmentId,
        purpose: 'dryrun',
        ...(dryrunId ? { dryrunId } : {}),
        expiresAt: new Date(Date.now() + remoteFunctionDryrunSandboxTimeoutMs + sandboxApiKeyTimeoutBufferMs)
    });
}

export function requireCustomerKeyId<T>(res: Response<T, Required<RequestLocals>>, message: string): number | null {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['apiKeyId']) {
        res.status(403).send({ error: { code: 'forbidden', message } } as T);
        return null;
    }

    return res.locals['apiKeyId'];
}

export function verifyDryrunResultSandboxToken<T>(res: Response<T, Required<RequestLocals>>, dryrunId: string): boolean {
    if (res.locals['sandboxTokenPurpose'] !== 'dryrun' || res.locals['sandboxTokenDryrunId'] !== dryrunId) {
        res.status(403).send({ error: { code: 'forbidden', message: 'This sandbox token is not authorized for this dryrun' } } as T);
        return false;
    }

    return true;
}

export function toFunctionDryrunError(err: unknown): FunctionDryrunError {
    if (err instanceof FunctionError) {
        return {
            code: err.code,
            message: err.message,
            ...(err.payload !== undefined ? { payload: err.payload } : {})
        };
    }

    return {
        code: 'dryrun_error',
        message: stringifyError(err)
    };
}
