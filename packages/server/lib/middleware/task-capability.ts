import { TASK_CAPABILITY_SCOPES } from '@nangohq/internal-auth';

import type { RequestLocals } from '../utils/express.js';
import type { Scope } from '@nangohq/authz';
import type { TaskCapabilityScope } from '@nangohq/internal-auth';
import type { NextFunction, Request, Response } from 'express';

/** Task scopes the public API accepts. Persist and jobs scopes are not checked here. */
export type ApiScope = Extract<TaskCapabilityScope, `api:${string}`>;

/** `can()` scopes for the capability a public route declares. */
export const API_TASK_SCOPES = {
    [TASK_CAPABILITY_SCOPES.apiConnectionRead]: ['environment:connections:read', 'environment:connections:read_credentials'],
    [TASK_CAPABILITY_SCOPES.apiIntegrationRead]: ['environment:integrations:read', 'environment:integrations:read_credentials'],
    [TASK_CAPABILITY_SCOPES.apiMetadataWrite]: ['environment:connections:update'],
    [TASK_CAPABILITY_SCOPES.apiEnvVarsRead]: ['environment:variables:read'],
    [TASK_CAPABILITY_SCOPES.apiSyncTrigger]: ['environment:syncs:execute'],
    [TASK_CAPABILITY_SCOPES.apiActionTrigger]: ['environment:actions:execute'],
    [TASK_CAPABILITY_SCOPES.apiProxy]: ['environment:proxy']
} as const satisfies Record<ApiScope, readonly [Scope, ...Scope[]]>;

/**
 * The route declares which task capability a task token must carry.
 * `secretKeyAuth` reads this and rejects a task token when it was not set.
 */
export function taskCapability(scope: ApiScope) {
    return (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void => {
        res.locals.taskCapability = scope;
        next();
    };
}

export function environmentScopesForTaskCapability(scope: ApiScope): readonly Scope[] {
    return API_TASK_SCOPES[scope];
}
