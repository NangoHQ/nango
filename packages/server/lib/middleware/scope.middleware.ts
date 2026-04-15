import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyScope } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export function hasScope({ grantedScopes, requiredScope }: { grantedScopes: string[] | undefined; requiredScope: ApiKeyScope }): boolean {
    // No scopes (undefined) means either:
    // 1. Legacy auth via api_secrets fallback — full access for backward compatibility
    // 2. Connect session auth via connectSessionOrSecretKeyAuth — no apiKeyScopes set
    // This fallback CANNOT be removed until:
    // - The api_secrets dual-read is fully cut off (all keys resolved via customer_keys)
    // - connectSessionOrSecretKeyAuth explicitly sets apiKeyScopes for session-based auth
    if (!grantedScopes) {
        return true;
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

export function withScope(requiredScope: ApiKeyScope) {
    return function (_req: Request, res: Response<unknown, RequestLocals>, next: NextFunction): void {
        const scopes = res.locals['apiKeyScopes'];

        if (hasScope({ grantedScopes: scopes, requiredScope })) {
            next();
            return;
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required: ${requiredScope}` } });
    };
}

export function withAnyScope(...requiredScopes: ApiKeyScope[]) {
    return function (_req: Request, res: Response<unknown, RequestLocals>, next: NextFunction): void {
        const scopes = res.locals['apiKeyScopes'];

        for (const scope of requiredScopes) {
            if (hasScope({ grantedScopes: scopes, requiredScope: scope })) {
                next();
                return;
            }
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required one of: ${requiredScopes.join(' or ')}` } });
    };
}
