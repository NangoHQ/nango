import { markAuthz } from './auditWiring.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyScope } from '@nangohq/types';
import type { RequestHandler } from 'express';

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

export function withScope(requiredScope: ApiKeyScope) {
    const handler: RequestHandler = function (_req, res, next) {
        const scopes = (res.locals as RequestLocals)['apiKeyScopes'];

        if (hasScope({ grantedScopes: scopes, requiredScope })) {
            next();
            return;
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required: ${requiredScope}` } });
    };
    return markAuthz(handler);
}

export function withAnyScope(...requiredScopes: ApiKeyScope[]) {
    const handler: RequestHandler = function (_req, res, next) {
        const scopes = (res.locals as RequestLocals)['apiKeyScopes'];

        for (const scope of requiredScopes) {
            if (hasScope({ grantedScopes: scopes, requiredScope: scope })) {
                next();
                return;
            }
        }

        res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required one of: ${requiredScopes.join(' or ')}` } });
    };
    return markAuthz(handler);
}
