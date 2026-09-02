import db from '@nangohq/database';
import { getPlanSafe } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { auditEventDropped, connectSessionActor, PUBLIC_KEY_ACTOR, recordAuditEvent, UNKNOWN_ACTOR } from '../../audit.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';
import { omitUndefined } from './input.js';

import type { RequestLocals } from '../../utils/express.js';
import type {
    AuditActor,
    AuditAttribution,
    AuditContext,
    AuditEvent,
    AuditMetadataFor,
    AuditOutcome,
    AuditTarget,
    AuditTargetType,
    AuditVia
} from '@nangohq/audit';
import type { AuditActionOf, AuditPolicy, AuditResource, AuditScope, Endpoint } from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

export const logger = getLogger('Audit');

export const Audit = {
    auditable: <R extends AuditResource, A extends AuditActionOf<R>, S extends AuditScope>(policy: {
        resource: R;
        action: A;
        scope: S;
    }): AuditPolicy<R, A, S> => ({
        kind: 'audit',
        ...policy
    })
};

type AuditRequest<TEndpoint extends Endpoint<any>> = Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>;

type AuditableEndpoint = Endpoint<any> & { Audit: AuditPolicy };

// Metadata is loosely typed here; per-event shapes live on the emit model (@nangohq/audit's AuditEvent).
// The metadata this endpoint's action may carry, straight from the contract's own table.
type AuditMetadataOf<TEndpoint extends AuditableEndpoint> = AuditMetadataFor<TEndpoint['Audit']['resource'], TEndpoint['Audit']['action']>;

type AuditSpec<TEndpoint extends AuditableEndpoint> = {
    policy: TEndpoint['Audit'];
    target?: (
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditTarget | AuditTarget[] | undefined | Promise<AuditTarget | AuditTarget[] | undefined>;
    // Created resources expose their id only in the response body — resolve the target from it at finish.
    // Runs only when `target` produced nothing, so a request-derived target always wins.
    targetFromResponse?: (
        response: TEndpoint['Success'],
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditTarget | AuditTarget[] | undefined | Promise<AuditTarget | AuditTarget[] | undefined>;
    metadata?: (
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditMetadataOf<TEndpoint> | undefined | Promise<AuditMetadataOf<TEndpoint> | undefined>;
    // Values known only after the handler responds (e.g. persisted scopes). Merged over request metadata at finish.
    metadataFromResponse?: (
        response: TEndpoint['Success'],
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => AuditMetadataOf<TEndpoint> | undefined | Promise<AuditMetadataOf<TEndpoint> | undefined>;
    // Defaults to the authenticated account (res.locals.account). Override when the audited account is not
    // the caller's — e.g. accepting/declining an invite is recorded under the inviting team, not the invitee.
    account?: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => Promise<{ id: number; uuid: string } | undefined>;
    environment?: (
        req: AuditRequest<TEndpoint>,
        locals: Partial<RequestLocals>
    ) => Promise<{ uuid: string; name: string } | null> | { uuid: string; name: string } | null;
};

export function resolveActor(locals: Partial<RequestLocals>): AuditActor {
    if (locals.authType === 'secretKey') {
        // Functions currently call the API with a secret key too, distinguished only by the
        // client-settable Nango-Is-Script header — spoofable, so we don't trust it for attribution.
        // Every secret-key caller is classified as api_key until functions get their own tokens.
        // Only a customer key has a uuid; the other auth sources have no key row, so they keep the internal id.
        return {
            type: 'api_key',
            id: locals.apiKeyUuid ?? (locals.apiKeyId != null ? String(locals.apiKeyId) : 'secret_key'),
            ...(locals.apiKeyDisplayName ? { display: locals.apiKeyDisplayName } : {})
        };
    }
    if (locals.authType === 'publicKey') {
        return PUBLIC_KEY_ACTOR;
    }
    // An end user is optional when the session carries tags, so the session can name nobody.
    if (locals.authType === 'connectSession') {
        return connectSessionActor(locals.endUser);
    }
    // Basic auth and auth-disabled deployments authenticate a dashboard user without calling it a session.
    if (locals.user) {
        return { type: 'user', id: String(locals.user.id), display: locals.user.email };
    }
    return UNKNOWN_ACTOR;
}

// Never on the impersonating account's own trail: "Nango acted via Nango" says nothing. Events for any
// other account keep the mark — the request did arrive through that session.
function auditVia(req: Request, accountId: number): AuditVia[] | undefined {
    const by = req.session?.impersonatedBy;
    if (!by || by.accountId === accountId) {
        return undefined;
    }
    return [{ type: 'impersonation', id: String(by.accountId), display: by.accountName, ...(by.actorId ? { actorId: String(by.actorId) } : {}) }];
}

/** The event fields that are purely a function of the request, so a new one lands on every emitter at once. */
export function auditRequestFields(req: Request, accountId: number): { context: AuditContext; via?: AuditVia[] } {
    const via = auditVia(req, accountId);
    return { context: contextFromRequest(req), ...(via ? { via } : {}) };
}

export function contextFromRequest(req: Request): AuditContext {
    const context: AuditContext = { interface: 'api' };
    if (req.ip) {
        context.ip = req.ip;
    }
    const userAgent = req.get('user-agent');
    if (userAgent) {
        context.userAgent = userAgent;
    }
    return context;
}

export function outcomeFromStatus(status: number): AuditOutcome {
    if (status < 300) {
        return 'success';
    }
    if (status === 401 || status === 403) {
        return 'denied';
    }
    return 'failure';
}

/** The event still records; the named field is what it lost. */
export function auditEnrichmentFailed(field: 'target' | 'metadata' | 'display' | 'environment', resource: string, err: unknown): void {
    logger.warning(`audit event enrichment failed`, { field, resource, err });
    metrics.increment(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field, resource });
}

// Low-RPS events only — never call this on a hot path (get-credentials derives displays from the request).
export async function resolveDisplay(target: AuditTargetType, lookup: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
        return await lookup();
    } catch (err) {
        auditEnrichmentFailed('display', target, err);
        return undefined;
    }
}

async function resolveEnvironment<TEndpoint extends AuditableEndpoint>(
    resolve: NonNullable<AuditSpec<TEndpoint>['environment']>,
    req: Request,
    locals: Partial<RequestLocals>,
    resource: string
): Promise<{ uuid: string; name: string } | undefined> {
    try {
        return (await resolve(req as AuditRequest<TEndpoint>, locals)) ?? undefined;
    } catch (err) {
        auditEnrichmentFailed('environment', resource, err);
        return undefined;
    }
}

async function emit(
    policy: AuditPolicy,
    req: Request,
    res: Response,
    resolved: ResolvedAudit | undefined,
    account: { id: number },
    // Only the id and name are recorded, so a caller that has just those - a conditional audit reading them
    // off the request - can emit without a full DBEnvironment.
    environment: { uuid: string; name: string } | undefined,
    // Supplied when the request cannot identify the caller but the handler can - an OAuth callback recovers
    // its end user from the connect session it looked up.
    actorOverride?: AuditActor
): Promise<void> {
    // Stamp occurredAt now so it reflects the response time, not audit-write latency.
    const occurredAt = new Date().toISOString();
    try {
        const locals = res.locals as Partial<RequestLocals>;
        const target = resolved?.target;
        const metadata = resolved?.metadata;
        const event = {
            occurredAt,
            accountId: account.id,
            scope: policy.scope,
            environment: policy.scope === 'account' || !environment ? null : { id: environment.uuid, display: environment.name },
            actor: actorOverride ?? resolveActor(locals),
            resource: policy.resource,
            action: policy.action,
            targets: Array.isArray(target) ? target : target ? [target] : [],
            ...auditRequestFields(req, account.id),
            outcome: outcomeFromStatus(res.statusCode),
            ...(metadata ? { metadata } : {})
        } as AuditEvent;
        await recordAuditEvent(event);
    } catch (err) {
        logger.error(`failed to emit audit event`, err);
        auditEventDropped(policy.resource, 'build_failed');
    }
}

export function resolveAuditAttribution(req: Request, locals: Partial<RequestLocals>): AuditAttribution {
    return { kind: 'request', actor: resolveActor(locals), context: contextFromRequest(req) };
}

// The entitlement belongs to the audited account, which a spec may override. Reuse the caller's plan
// when they are the same account, so only an override pays for a lookup.
async function auditedAccountPlan(account: { id: number }, locals: Partial<RequestLocals>) {
    return account.id === locals.account?.id ? locals.plan : await getPlanSafe(db.knex, { accountId: account.id });
}

interface AuditSubject {
    account: { id: number; uuid: string };
    environment: { uuid: string; name: string } | undefined;
}

interface ResolvedAudit {
    target: AuditTarget | AuditTarget[] | undefined;
    metadata: unknown;
}

// Place AFTER auth and BEFORE authorization so it captures every outcome — including 403 denials
// that never reach the controller.
export function auditable<TEndpoint extends AuditableEndpoint>(spec: AuditSpec<TEndpoint>): RequestHandler {
    return build(spec);
}

/**
 * For an endpoint that only sometimes does the audited thing — a connection upsert that may have
 * re-authorized rather than created. `skipWhen` is read at finish, so it sees what the handler recorded on
 * the request, and it is deliberately a negative condition: the default stays "emit", so a denial or a
 * failure is still recorded and only the named case is dropped.
 *
 * A separate factory rather than a field on `AuditSpec`, so `auditable`'s promise to record every outcome
 * cannot be weakened one spec at a time.
 */
export function maybeAuditable<TEndpoint extends AuditableEndpoint>(
    spec: AuditSpec<TEndpoint> & {
        skipWhen: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => boolean;
        subject: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => AuditSubject | undefined;
        actor?: ((req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => AuditActor) | undefined;
        // `target`/`metadata` are resolved before the handler runs and `*FromResponse` needs a JSON body, so
        // neither can read what the handler recorded — and the OAuth callback answers with HTML. This fills
        // whatever is still missing, at finish, from the request.
        atFinish?: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => ResolvedAudit;
    }
): RequestHandler {
    const { skipWhen, atFinish, subject, actor, ...rest } = spec;
    return build(rest as AuditSpec<TEndpoint>, { skipWhen, atFinish, subject, actor });
}

function build<TEndpoint extends AuditableEndpoint>(
    spec: AuditSpec<TEndpoint>,
    conditional?: {
        skipWhen: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => boolean;
        atFinish?: ((req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => ResolvedAudit) | undefined;
        // Who the event belongs to, read at finish. `auditable` takes this from `res.locals` before the
        // handler runs, which an unauthenticated route cannot supply.
        subject: (req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => AuditSubject | undefined;
        actor?: ((req: AuditRequest<TEndpoint>, locals: Partial<RequestLocals>) => AuditActor) | undefined;
    }
): RequestHandler {
    return (req, res, next) => {
        void (async () => {
            try {
                const locals = res.locals as Partial<RequestLocals>;
                if (conditional) {
                    // Everything this decides needs the handler to have run: whether the audited thing
                    // happened at all, and — on an unauthenticated route — which account it happened to. So
                    // the listener goes on unconditionally and the entitlement is checked at finish.
                    res.on('finish', () => {
                        void (async () => {
                            const typedReq = req as AuditRequest<TEndpoint>;
                            if (conditional.skipWhen(typedReq, locals)) {
                                return;
                            }
                            const subject = conditional.subject(typedReq, locals);
                            if (!subject || !(await canRecordAuditTrail(subject.account.uuid, await auditedAccountPlan(subject.account, locals)))) {
                                return;
                            }
                            await emit(
                                spec.policy,
                                req,
                                res,
                                conditional.atFinish?.(typedReq, locals),
                                subject.account,
                                subject.environment,
                                conditional.actor?.(typedReq, locals)
                            );
                        })();
                    });
                    return;
                }
                // Resolve the audited account before the flag gate: a spec may attribute the event to an
                // account other than the caller's (see AuditSpec.account), and the gate must use that one.
                const account = spec.account ? await spec.account(req, locals) : locals.account;
                // Freeze account + environment before the handler runs, for the same reason as target/metadata below.
                const environment = spec.environment ? await resolveEnvironment(spec.environment, req, locals, spec.policy.resource) : locals.environment;
                if (account && (await canRecordAuditTrail(account.uuid, await auditedAccountPlan(account, locals)))) {
                    // Capture the response body only when a spec needs it — the id of a created resource is
                    // known only after the handler responds. Wrap res.json before next() runs the handler.
                    let responseBody: unknown;
                    if (spec.targetFromResponse || spec.metadataFromResponse) {
                        const originalJson = res.json.bind(res);
                        res.json = ((body: unknown) => {
                            responseBody = body;
                            return originalJson(body);
                        }) as typeof res.json;
                    }
                    // Register the finish listener only once we know we should audit — a disabled account
                    // never installs a dead listener. It reads `resolved` lazily at finish, so it captures
                    // whatever each resolver managed to produce.
                    let resolved: ResolvedAudit | undefined;
                    res.on('finish', () => {
                        void (async () => {
                            if (outcomeFromStatus(res.statusCode) === 'success' && responseBody !== undefined && resolved) {
                                if (spec.targetFromResponse && resolved.target === undefined) {
                                    try {
                                        resolved.target = await spec.targetFromResponse(responseBody as TEndpoint['Success'], req, locals);
                                    } catch (err) {
                                        auditEnrichmentFailed('target', spec.policy.resource, err);
                                    }
                                }
                                if (spec.metadataFromResponse) {
                                    try {
                                        const fromResponse = await spec.metadataFromResponse(responseBody as TEndpoint['Success'], req, locals);
                                        resolved.metadata = omitUndefined({
                                            ...(resolved.metadata && typeof resolved.metadata === 'object' ? resolved.metadata : {}),
                                            ...fromResponse
                                        });
                                    } catch (err) {
                                        auditEnrichmentFailed('metadata', spec.policy.resource, err);
                                    }
                                }
                            }
                            await emit(spec.policy, req, res, resolved, account, environment);
                        })();
                    });
                    // Resolve target and metadata before the handler runs — some handlers move or overwrite
                    // the pre-mutation state (a removed member, an old role).
                    const partial: ResolvedAudit = { target: undefined, metadata: undefined };
                    try {
                        partial.target = spec.target ? await spec.target(req, locals) : undefined;
                    } catch (err) {
                        auditEnrichmentFailed('target', spec.policy.resource, err);
                    }
                    try {
                        partial.metadata = spec.metadata ? await spec.metadata(req, locals) : undefined;
                    } catch (err) {
                        auditEnrichmentFailed('metadata', spec.policy.resource, err);
                    }
                    resolved = partial;
                }
            } catch (err) {
                logger.error(`failed to build audit event`, err);
            } finally {
                next();
            }
        })();
    };
}
