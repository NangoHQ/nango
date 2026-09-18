import { ScopeRequiresEnvironmentError } from '@nangohq/authz';

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
    return (_req: Request, res: Response, next: NextFunction): void => {
        try {
            for (const required of scopes) {
                if (principalCan(res.locals as Partial<RequestLocals>, required)) {
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
                res.status(500).json({ error: { code: 'missing_principal' } });
                return;
            }
            throw err;
        }

        res.status(403).json({ error: { code: 'forbidden', message: insufficientScopeMessage(scopes) } });
    };
}

export const withScope = can;
export const withAnyScope = can;
