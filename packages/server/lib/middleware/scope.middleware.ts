import { authorizeApiKey, hasApiKeyScope } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyAuthorizationTarget, CustomerKeyScope } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export function hasScope({ grantedScopes, requiredScope }: { grantedScopes: readonly string[] | undefined; requiredScope: CustomerKeyScope }): boolean {
    return hasApiKeyScope({ grantedScopes, requiredScope });
}

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

export function withScope(requiredScope: CustomerKeyScope) {
    return function (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void {
        if (hasAuthorizedScope({ locals: res.locals, requiredScope })) {
            next();
            return;
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required: ${requiredScope}` } });
    };
}

export function withAnyScope(...requiredScopes: CustomerKeyScope[]) {
    return function (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void {
        for (const scope of requiredScopes) {
            if (hasAuthorizedScope({ locals: res.locals, requiredScope: scope })) {
                next();
                return;
            }
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required one of: ${requiredScopes.join(' or ')}` } });
    };
}
