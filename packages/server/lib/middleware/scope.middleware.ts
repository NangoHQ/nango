import { authorizeApiKey, canAccessApiKeyTarget } from '@nangohq/utils';

import { can } from '../authz/middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyAuthorizationTarget, CustomerKeyScope } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

function targetForScope(locals: Partial<RequestLocals>, requiredScope: CustomerKeyScope): ApiKeyAuthorizationTarget | null {
    const account = locals.account;
    if (!account) {
        return null;
    }

    if (requiredScope.startsWith('account:')) {
        return { type: 'account', accountId: account.id };
    }

    const environment = locals.environment;
    if (!environment) {
        return null;
    }

    return { type: 'environment', accountId: account.id, environmentId: environment.id };
}

export function hasAuthorizedScope({ locals, requiredScope }: { locals: Partial<RequestLocals>; requiredScope: CustomerKeyScope }): boolean {
    const principal = locals.apiKeyPrincipal;
    const target = targetForScope(locals, requiredScope);
    return Boolean(principal && target && authorizeApiKey({ principal, requiredScope, target }));
}

/**
 * Enforces environment ownership for routes that intentionally have no API scope.
 * Routes with scope requirements must use withScope or withAnyScope instead.
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

export const withScope = can;
export const withAnyScope = can;
