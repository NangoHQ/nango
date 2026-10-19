import { TASK_CAPABILITY_SCOPES } from '@nangohq/internal-auth';

import type { RequestLocals } from '../utils/express.js';
import type { Scope } from '@nangohq/authz';
import type { TaskCapabilityScope } from '@nangohq/internal-auth';
import type { NextFunction, Request, Response } from 'express';

/**
 * The route declares which task capability a task token must carry.
 * `secretKeyAuth` reads this and rejects a task token when it was not set.
 */
export function taskCapability(scope: TaskCapabilityScope) {
    return (_req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction): void => {
        res.locals.taskCapability = scope;
        next();
    };
}

/** `can()` scopes for the capability this route declared. A non-API scope grants none. */
export function environmentScopesForTaskCapability(scope: TaskCapabilityScope): readonly Scope[] {
    switch (scope) {
        case TASK_CAPABILITY_SCOPES.apiConnectionRead:
            return ['environment:connections:read', 'environment:connections:read_credentials'];
        case TASK_CAPABILITY_SCOPES.apiIntegrationRead:
            return ['environment:integrations:read', 'environment:integrations:read_credentials'];
        case TASK_CAPABILITY_SCOPES.apiMetadataWrite:
            return ['environment:connections:update'];
        case TASK_CAPABILITY_SCOPES.apiEnvVarsRead:
            return ['environment:variables:read'];
        case TASK_CAPABILITY_SCOPES.apiSyncTrigger:
            return ['environment:syncs:execute'];
        case TASK_CAPABILITY_SCOPES.apiActionTrigger:
            return ['environment:actions:execute'];
        case TASK_CAPABILITY_SCOPES.apiProxy:
            return ['environment:proxy'];
        case TASK_CAPABILITY_SCOPES.persistLog:
        case TASK_CAPABILITY_SCOPES.persistRecords:
        case TASK_CAPABILITY_SCOPES.persistCheckpoint:
        case TASK_CAPABILITY_SCOPES.persistCursor:
        case TASK_CAPABILITY_SCOPES.persistLocks:
        case TASK_CAPABILITY_SCOPES.persistTelemetry:
        case TASK_CAPABILITY_SCOPES.persistAbort:
        case TASK_CAPABILITY_SCOPES.persistSyncConflict:
        case TASK_CAPABILITY_SCOPES.jobsHeartbeat:
        case TASK_CAPABILITY_SCOPES.jobsPutTask:
            return [];
    }
}
