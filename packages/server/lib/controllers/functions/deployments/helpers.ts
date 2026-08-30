import type { RequestLocals } from '../../../utils/express.js';
import type { Response } from 'express';

export function verifyDeploymentResultSandboxToken<T>(res: Response<T, RequestLocals>, deploymentId: string): boolean {
    if (res.locals['sandboxTokenPurpose'] !== 'deploy' || res.locals['sandboxTokenDeploymentId'] !== deploymentId) {
        res.status(403).send({ error: { code: 'forbidden', message: 'This sandbox token is not authorized for this deployment' } } as T);
        return false;
    }

    return true;
}
