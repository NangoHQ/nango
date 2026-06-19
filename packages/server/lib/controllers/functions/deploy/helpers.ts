import db from '@nangohq/database';
import { FunctionError, deploySandboxTimeoutMs, sandboxApiKeyService } from '@nangohq/sandbox';
import { stringifyError } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { FunctionDeploymentError } from '@nangohq/sandbox';
import type { Response } from 'express';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;

export async function createDeploySandboxApiKey(parentApiKeyId: number, environmentId: number, deploymentId: string) {
    return await sandboxApiKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId,
        environmentId,
        purpose: 'deploy',
        deploymentId,
        expiresAt: new Date(Date.now() + deploySandboxTimeoutMs + sandboxApiKeyTimeoutBufferMs)
    });
}

export function requireCustomerKeyId<T>(res: Response<T, Required<RequestLocals>>, message: string): number | null {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['apiKeyId']) {
        res.status(403).send({ error: { code: 'forbidden', message } } as T);
        return null;
    }

    return res.locals['apiKeyId'];
}

export function verifyDeploymentResultSandboxToken<T>(res: Response<T, Required<RequestLocals>>, deploymentId: string): boolean {
    if (res.locals['sandboxTokenPurpose'] !== 'deploy' || res.locals['sandboxTokenDeploymentId'] !== deploymentId) {
        res.status(403).send({ error: { code: 'forbidden', message: 'This sandbox token is not authorized for this deployment' } } as T);
        return false;
    }

    return true;
}

export function toFunctionDeploymentError(err: unknown): FunctionDeploymentError {
    if (err instanceof FunctionError) {
        return {
            code: err.code,
            message: err.message,
            ...(err.payload !== undefined ? { payload: err.payload } : {})
        };
    }

    return {
        code: 'deployment_error',
        message: stringifyError(err)
    };
}
