import { canAccessApiKeyTarget } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

/**
 * Enforces environment ownership for routes that intentionally have no API scope.
 * Routes with scope requirements must use `can` instead.
 */
export function withEnvironmentTarget(_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void {
    const { account, environment, apiKeyPrincipal } = res.locals;
    if (
        !account ||
        !environment ||
        !apiKeyPrincipal ||
        !canAccessApiKeyTarget(apiKeyPrincipal, {
            type: 'environment',
            accountId: account.id,
            environmentId: environment.id
        })
    ) {
        res.status(403).json({ error: { code: 'forbidden', message: 'API key is not authorized for an environment' } });
        return;
    }

    next();
}
