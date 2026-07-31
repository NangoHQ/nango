import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyScope } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export function hasScope({ grantedScopes, requiredScope }: { grantedScopes: string[] | undefined; requiredScope: ApiKeyScope }): boolean {
    if (!grantedScopes) {
        return false;
    }

    for (const s of grantedScopes) {
        if (s === requiredScope) {
            return true;
        }
        if (s.endsWith(':*') && requiredScope.startsWith(s.slice(0, -1))) {
            return true;
        }
    }

    return false;
}

function guard(requiredScopes: ApiKeyScope[]) {
    return function (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void {
        const scopes = res.locals['apiKeyScopes'];

        for (const scope of requiredScopes) {
            if (hasScope({ grantedScopes: scopes, requiredScope: scope })) {
                next();
                return;
            }
        }

        const required = requiredScopes.length > 1 ? `one of: ${requiredScopes.join(' or ')}` : requiredScopes[0];
        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required: ${required}` } });
    };
}

export function withScope(requiredScope: ApiKeyScope) {
    return guard([requiredScope]);
}

export function withAnyScope(...requiredScopes: ApiKeyScope[]) {
    return guard(requiredScopes);
}
