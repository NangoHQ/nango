import jwt from 'jsonwebtoken';

import db from '@nangohq/database';
import { accountService, getPlanSafe, userService } from '@nangohq/shared';

import { auditEventDropped, makeAuditTarget as makeTarget, recordAuditEvent } from '../../audit.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';
import { Audit, auditable, auditRequestFields, logger, outcomeFromStatus } from './auditable.js';

import type { AppAuthLoginMethod, AuditActor, AuditEvent, AuditOutcome } from '@nangohq/audit';
import type {
    DBTeam,
    DBUser,
    Endpoint,
    GetManagedCallback,
    PostLogout,
    PostManagedEmailVerification,
    PostSignin,
    PostSignup,
    PutResetPassword,
    PutUserPassword
} from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

type AuthAction = 'login' | 'logout' | 'signup' | 'password_reset';

// Auth routes never populate res.locals (they authenticate inside the controller / passport), so the
// actor and account are resolved per-event at finish from the request itself.
interface AuthPrincipal {
    userId: number;
    userEmail: string;
    account: DBTeam;
}

// Each auth middleware binds its endpoint type so the resolver reads a typed `req.body` — a rename of
// a body field in the contract becomes a compile error at the wiring site below.
type AuthRequest<TEndpoint extends Endpoint<any>> = Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>;

type PrincipalResolver<TEndpoint extends Endpoint<any>> = (req: AuthRequest<TEndpoint>) => Promise<AuthPrincipal | null>;

// The SSO callback resolves login vs signup only at request time (a first sign-in creates the user),
// so the action can be a function of the request rather than a fixed value.
type AuthActionResolver<TEndpoint extends Endpoint<any>> = AuthAction | ((req: AuthRequest<TEndpoint>) => AuthAction);

// Interface (not an intersection, which widens `Body` back to `any`) so `req.body.email` stays typed.
interface EmailBodyEndpoint extends Endpoint<any> {
    Body: { email: string };
}

interface AuthAuditOptions {
    recordNonSuccess?: boolean;
    method?: AppAuthLoginMethod;
    // These routes can't be classified by status (the SSO callback replies 302 on both success and
    // failure). Success is instead signaled by the controller setting req.audit?.authSucceeded when
    // req.login actually established a session this request — not by a pre-existing session's req.user.
    sessionOutcome?: boolean;
}

async function principalFromUser(user: Pick<DBUser, 'id' | 'email' | 'account_id'> | null): Promise<AuthPrincipal | null> {
    if (!user) {
        return null;
    }
    const account = await accountService.getAccountById(db.knex, user.account_id);
    return account ? { userId: user.id, userEmail: user.email, account } : null;
}

// Maps the attempted email to its user (and account). Used for login and signup; on a rejected login
// the email resolves the target the attempt was aimed at (the actor is anonymous — see recordAuthEvent).
// An email that maps to no user yields null — we skip rather than invent an account or leak existence.
async function principalFromBodyEmail<TEndpoint extends EmailBodyEndpoint>(req: AuthRequest<TEndpoint>): Promise<AuthPrincipal | null> {
    const email = req.body.email;
    if (!email) {
        return null;
    }
    return principalFromUser(await userService.getUserByEmail(email));
}

// Actor is the user a login held for MFA authenticated as, or the session user req.login established.
// Pending wins: regenerateSession leaves an earlier session's req.user in place, which would attribute the
// challenge to whoever was signed in before. Neither means the flow never authenticated → skip.
async function principalFromSessionUser(req: Request): Promise<AuthPrincipal | null> {
    const pendingUserId = req.audit?.authPendingMfa?.userId;
    if (pendingUserId != null) {
        return principalFromUser(await userService.getUserById(pendingUserId, true));
    }
    const sessionUser = req.user;
    return sessionUser ? principalFromUser({ id: sessionUser.id, email: sessionUser.email, account_id: sessionUser.account_id }) : null;
}

async function recordAuthEvent<TEndpoint extends Endpoint<any>>(
    actionOrResolver: AuthActionResolver<TEndpoint>,
    resolve: PrincipalResolver<TEndpoint>,
    options: AuthAuditOptions,
    req: AuthRequest<TEndpoint>,
    res: Response
): Promise<void> {
    // Stamp occurredAt now so it reflects the response time, not audit-write latency.
    const occurredAt = new Date().toISOString();
    try {
        const action = typeof actionOrResolver === 'function' ? actionOrResolver(req) : actionOrResolver;
        let outcome: AuditOutcome;
        if (options.sessionOutcome) {
            // Only a login this request actually established (req.login → req.audit?.authSucceeded) is a
            // success. Without it, req.user may just be a pre-existing session, so a failed attempt by an
            // already-signed-in user would otherwise be recorded as a successful login for that user.
            if (!req.audit?.authSucceeded && !req.audit?.authPendingMfa) {
                return;
            }
            outcome = 'success';
        } else {
            outcome = outcomeFromStatus(res.statusCode);
            if (outcome !== 'success' && !options.recordNonSuccess) {
                return;
            }
        }
        const principal = await resolve(req);
        if (!principal) {
            return;
        }
        // Runs before authentication, so there is no res.locals.plan to read the entitlement from.
        if (!(await canRecordAuditTrail(principal.account.uuid, await getPlanSafe(db.knex, { accountId: principal.account.id })))) {
            return;
        }
        const ref = { type: 'user' as const, id: String(principal.userId), display: principal.userEmail };
        // A non-success attempt never authenticated as the claimed email — the actor is anonymous, and the
        // (untrusted) email is only the target it was aimed at (never the actor).
        const actor: AuditActor = outcome === 'success' ? ref : { type: 'anonymous', id: 'unknown', display: 'anonymous' };
        const common = {
            occurredAt,
            accountId: principal.account.id,
            scope: 'account' as const,
            environment: null,
            actor,
            targets: [ref],
            ...auditRequestFields(req, principal.account.id),
            outcome
        };
        // Read MFA state from the request, not the response body, so we don't wrap res.json. Per-request
        // rather than the session, which can still hold a challenge started by an earlier attempt.
        const event: AuditEvent =
            action === 'login'
                ? {
                      ...common,
                      resource: 'app_auth',
                      action: 'login',
                      metadata: { mfaRequired: Boolean(req.audit?.authPendingMfa), ...(options.method ? { method: options.method } : {}) }
                  }
                : { ...common, resource: 'app_auth', action };
        await recordAuditEvent(event);
    } catch (err) {
        logger.error('failed to emit auth audit event', err);
        auditEventDropped('app_auth', 'build_failed');
    }
}

function auditAuth<TEndpoint extends Endpoint<any>>(
    action: AuthActionResolver<TEndpoint>,
    resolve: PrincipalResolver<TEndpoint>,
    options: AuthAuditOptions = {}
): RequestHandler {
    return (req, res, next) => {
        res.on('finish', () => {
            void recordAuthEvent<TEndpoint>(action, resolve, options, req, res);
        });
        next();
    };
}

// Placed BEFORE authenticateLocalSignin so the finish hook is registered even when auth rejects the
// attempt — a rejected sign-in is recorded with outcome `denied`/`failure`.
export const auditAuthLogin = auditAuth<PostSignin>('login', principalFromBodyEmail, { recordNonSuccess: true, method: 'local' });

export const auditAuthLogout = auditAuth<PostLogout>('logout', principalFromSessionUser);

export const auditAuthSignup = auditAuth<PostSignup>('signup', principalFromBodyEmail);

export const auditAppAuthPasswordChanged = auditable<PutUserPassword>({
    policy: Audit.auditable({ resource: 'app_auth', action: 'password_changed', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

// By finish the controller has cleared the reset token from the DB, so recover the actor by decoding the email from the JWT rather than looking it up by token.
export const auditAuthPasswordReset = auditAuth<PutResetPassword>('password_reset', async (req) => {
    const token = req.body.token;
    if (!token) {
        return null;
    }
    const decoded = jwt.decode(token);
    const email = decoded && typeof decoded === 'object' && typeof decoded['user'] === 'string' ? decoded['user'] : undefined;
    if (!email) {
        return null;
    }
    return principalFromUser(await userService.getUserByEmail(email));
});

// Session-establishing routes: the controller authenticates then req.login, so the actor is the session user and success comes from sessionOutcome.
export const auditAuthManagedCallback = auditAuth<GetManagedCallback>((req) => (req.audit?.managedSignup ? 'signup' : 'login'), principalFromSessionUser, {
    sessionOutcome: true,
    method: 'sso'
});

export const auditAuthManagedVerification = auditAuth<PostManagedEmailVerification>(
    (req) => (req.audit?.managedSignup ? 'signup' : 'login'),
    principalFromSessionUser,
    { sessionOutcome: true, method: 'managed' }
);
