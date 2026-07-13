import { audit } from '@nangohq/audit';
import { getFlags } from '@nangohq/feature-flags';
import { getLogger } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { AuditActor, AuditContext, AuditEvent, AuditOutcome, AuditTarget, MemberRoleChangedMetadata } from '@nangohq/audit';
import type { DeleteConnection, DeletePublicConnection, Endpoint, PatchTeamUser } from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

const logger = getLogger('Audit');

// Request typed to a specific endpoint's contract (params/body/query), mirroring asyncWrapper.
// The extractors below read from it, so renaming/removing a field in the endpoint type breaks
// the spec at compile time — the runtime integration tests are the second line of defence.
type AuditRequest<TEndpoint extends Endpoint<any>> = Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>;

// Everything is derived from the request so the event can be emitted for any outcome —
// including permission denials, where the controller never runs.
interface AuditSpecBase<TEndpoint extends Endpoint<any>> {
    target?: (req: AuditRequest<TEndpoint>) => AuditTarget | undefined;
    // Emit a null environmentId even when the request carries one: these events aren't env-specific.
    accountScoped?: boolean;
}

export type AuditSpec<TEndpoint extends Endpoint<any> = Endpoint<any>> =
    | (AuditSpecBase<TEndpoint> & { resource: 'connection'; action: 'deleted' })
    | (AuditSpecBase<TEndpoint> & {
          resource: 'member';
          action: 'role_changed';
          metadata?: (req: AuditRequest<TEndpoint>) => MemberRoleChangedMetadata | undefined;
      });

function resolveActor(locals: RequestLocals): AuditActor {
    if (locals.authType === 'session' && locals.user) {
        return { type: 'user', id: String(locals.user.id), display: locals.user.email };
    }
    if (locals.authType === 'secretKey') {
        // Functions currently call the API with a secret key too, distinguished only by the
        // client-settable Nango-Is-Script header — spoofable, so we don't trust it for attribution.
        // Every secret-key caller is classified as api_key until functions get their own tokens.
        return {
            type: 'api_key',
            id: locals.apiKeyId != null ? String(locals.apiKeyId) : 'secret_key',
            ...(locals.apiKeyDisplayName ? { display: locals.apiKeyDisplayName } : {})
        };
    }
    return { type: 'system', id: locals.account ? String(locals.account.id) : 'unknown' };
}

function contextFromRequest(req: Request): AuditContext {
    const context: AuditContext = {};
    if (req.ip) {
        context.ip = req.ip;
    }
    const userAgent = req.get('user-agent');
    if (userAgent) {
        context.userAgent = userAgent;
    }
    return context;
}

function outcomeFromStatus(status: number): AuditOutcome {
    if (status < 300) {
        return 'success';
    }
    if (status === 401 || status === 403) {
        return 'denied';
    }
    return 'failure';
}

async function emit(spec: AuditSpec, req: Request, res: Response): Promise<void> {
    // Stamp occurredAt now, before the async flag check, so it reflects the response — not flag latency.
    const occurredAt = new Date().toISOString();
    try {
        const locals = res.locals as RequestLocals;
        const { account, environment } = locals;
        if (!account) {
            return;
        }
        if (!(await getFlags().isAuditLoggingEnabled(account.uuid))) {
            return;
        }
        const target = spec.target?.(req);
        const metadata = 'metadata' in spec ? spec.metadata?.(req) : undefined;
        // Cast is plumbing: AuditSpec already type-checks against the AuditEvent variants, but TS
        // can't narrow the spread back to one.
        const event = {
            occurredAt,
            accountId: account.id,
            environmentId: spec.accountScoped ? null : (environment?.id ?? null),
            actor: resolveActor(locals),
            resource: spec.resource,
            action: spec.action,
            targets: target ? [target] : [],
            context: contextFromRequest(req),
            outcome: outcomeFromStatus(res.statusCode),
            ...(metadata ? { metadata } : {})
        } as AuditEvent;
        audit.record(event);
    } catch (err) {
        logger.error(`failed to emit audit event`, err);
    }
}

// Place AFTER auth and BEFORE authorization so it captures every outcome — including 403 denials
// that never reach the controller. Fire-and-forget on response finish.
export function auditable<TEndpoint extends Endpoint<any>>(spec: AuditSpec<TEndpoint>): RequestHandler {
    return (req, res, next) => {
        res.on('finish', () => {
            void emit(spec, req, res);
        });
        next();
    };
}

// Per-route wiring is manual: new connection-delete routes (e.g. the admin delete) must opt in.
// Bound to both delete-connection endpoints so `connectionId` is checked against their contracts.
export const auditConnectionDeleted = auditable<DeletePublicConnection | DeleteConnection>({
    resource: 'connection',
    action: 'deleted',
    target: (req) => ({ type: 'connection', id: req.params.connectionId })
});

export const auditMemberRoleChanged = auditable<PatchTeamUser>({
    resource: 'member',
    action: 'role_changed',
    accountScoped: true,
    // req.params.id is typed `number` by the contract but is a raw string here — the controller coerces its own copy.
    target: (req) => ({ type: 'member', id: String(req.params.id) }),
    metadata: (req) => {
        const role = req.body?.role;
        return typeof role === 'string' ? { toRole: role } : undefined;
    }
});
