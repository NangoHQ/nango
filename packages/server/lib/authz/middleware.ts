import { ScopeRequiresEnvironmentError } from '@nangohq/authz';
import { errorManager, ErrorSourceEnum, LogActionEnum } from '@nangohq/shared';

import { MissingPrincipalError, principalCan } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { Scope } from '@nangohq/authz';
import type { NextFunction, Request, Response } from 'express';

function insufficientScopeMessage(scopes: readonly Scope[]): string {
    if (scopes.length === 1) {
        return `Insufficient scope. Required: ${scopes[0]}`;
    }
    return `Insufficient scope. Required one of: ${scopes.join(' or ')}`;
}

export function can(scope: Scope, ...or: Scope[]) {
    const scopes = [scope, ...or];
    return (req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void => {
        try {
            for (const required of scopes) {
                if (principalCan(res.locals, required)) {
                    next();
                    return;
                }
            }
        } catch (err) {
            if (err instanceof ScopeRequiresEnvironmentError) {
                res.status(400).json({ error: { code: 'missing_environment' } });
                return;
            }
            if (err instanceof MissingPrincipalError) {
                errorManager.report(err, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.INTERNAL_AUTHORIZATION,
                    ...(res.locals['account'] ? { accountId: res.locals['account'].id } : {}),
                    ...(res.locals['environment'] ? { environmentId: res.locals['environment'].id } : {}),
                    metadata: {
                        requiredScope: err.scope,
                        route: req.path
                    }
                });
                res.status(500).json({ error: { code: 'missing_principal' } });
                return;
            }
            throw err;
        }

        res.status(403).json({ error: { code: 'forbidden', message: insufficientScopeMessage(scopes) } });
    };
}

/**
 * Slot in the public pipeline for naming the environment target.
 * Auth still infers a single-env key in SQL. This does not check key ownership — `can` / `authorize` owns `where`.
 */
export function resolveEnvironment(_req: Request, res: Response, next: NextFunction): void {
    if ((res.locals as Partial<RequestLocals>).environment) {
        next();
        return;
    }
    // TODO: resolve a client-supplied env (header or otherwise). Do not invent an env here.
    next();
}
