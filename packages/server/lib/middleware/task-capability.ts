import tracer from 'dd-trace';

import {
    hasScope,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    keyRegistryFromPublicKeys,
    verifyTaskCapabilityToken
} from '@nangohq/internal-auth';
import { accountService, errorManager } from '@nangohq/shared';
import { flagHasPlan, getLogger, stringifyError, tagTraceUser } from '@nangohq/utils';

import { can } from '../authz/middleware.js';
import { principalFor } from '../authz/principal.js';
import { envs } from '../env.js';
import accessMiddleware, { eddsaBearerToken } from './access.middleware.js';
import { afterCredentialAuth } from './env-auth.js';

import type { RequestLocals } from '../utils/express.js';
import type { Scope } from '@nangohq/authz';
import type { TaskCapabilityScope } from '@nangohq/internal-auth';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const logger = getLogger('TaskCapability');

/**
 * Each api scope maps to the can() scopes already declared on that route, so the permission check
 * and the route's declared scope stay the same list. Connection and integration reads include the
 * credentials scope because script calls to those routes read credentials.
 */
export const API_TASK_SCOPES = {
    'api:connection:read': ['environment:connections:read', 'environment:connections:read_credentials'],
    'api:integration:read': ['environment:integrations:read', 'environment:integrations:read_credentials'],
    'api:metadata:write': ['environment:connections:update'],
    'api:env-vars:read': ['environment:variables:read'],
    'api:sync:trigger': ['environment:syncs:execute'],
    'api:action:trigger': ['environment:tools:call']
} as const satisfies Record<Extract<TaskCapabilityScope, `api:${string}`>, readonly Scope[]>;

export type ApiTaskScope = keyof typeof API_TASK_SCOPES;

// Built once at process start. Verification receives this registry and never builds one per request.
const jobsRegistry = keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS);

/**
 * Secret-key auth, then the route's can() check. An EdDSA task token is accepted only when it
 * verifies for the server audience, carries `scope`, and its environment exists. The server binds
 * the environment only: scripts may read other connections in that environment, which is deliberate.
 * `beforeCan` runs after auth and before the permission check, which is where audit middleware sits.
 */
export function withTaskCapability(scope: ApiTaskScope, opts?: { beforeCan?: RequestHandler[] }): RequestHandler[] {
    const scopes = API_TASK_SCOPES[scope];
    const [required, ...rest] = scopes;
    return [taskOrSecret(scope), ...afterCredentialAuth, ...(opts?.beforeCan ?? []), can(required, ...rest)];
}

function taskOrSecret(scope: ApiTaskScope): RequestHandler {
    return (req, res, next) => {
        const token = eddsaBearerToken(req.get('authorization'));
        if (!token) {
            void accessMiddleware.secretKeyAuth(req, res, next);
            return;
        }
        void authenticateTask(req, res, next, token, scope);
    };
}

async function authenticateTask(
    _req: Request,
    res: Response<unknown, Partial<RequestLocals>>,
    next: NextFunction,
    token: string,
    scope: ApiTaskScope
): Promise<void> {
    const span = tracer.startSpan('taskCapabilityAuth', { childOf: tracer.scope().active() });
    try {
        const auth = await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_SERVER, jobsRegistry);
        if (!auth) {
            errorManager.errRes(res, 'unknown_account');
            return;
        }
        if (!hasScope(auth, scope)) {
            res.status(403).json({ error: { code: 'forbidden', message: `Insufficient scope. Required: ${scope}` } });
            return;
        }

        const result = await accountService.getTaskTokenAccountContext(auth.res.environmentId);
        if (result.isErr()) {
            span.setTag('error', result.error);
            logger.error(`failed_task_token_account_context ${stringifyError(result.error)}`);
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }
        if (!result.value) {
            errorManager.errRes(res, 'unknown_account');
            return;
        }

        const context = result.value;
        if (flagHasPlan && !context.plan) {
            errorManager.errRes(res, 'plan_not_found');
            return;
        }
        const scopes: Scope[] = [...API_TASK_SCOPES[scope]];
        res.locals.authType = 'taskToken';
        res.locals.account = context.account;
        res.locals.plan = context.plan;
        res.locals.environment = context.environment;
        res.locals.apiKeyAuthSource = 'task_token';
        res.locals.apiKeyPrincipal = {
            type: 'api_key',
            source: 'task_token',
            accountId: context.account.id,
            scopes,
            environmentIds: [context.environment.id],
            subjectId: auth.sub
        };
        principalFor(res.locals);
        tagTraceUser({ account: context.account, environment: context.environment, plan: context.plan });
        next();
    } catch (err) {
        span.setTag('error', err);
        logger.error(`failed_task_capability_auth ${stringifyError(err)}`);
        res.status(500).send({ error: { code: 'server_error' } });
    } finally {
        span.finish();
    }
}
