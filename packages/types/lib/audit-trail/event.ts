// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'system';
export type AuditTargetType = 'connection' | 'member';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditResource = 'connection' | 'member';
export type AuditAction = 'deleted' | 'role_changed';
export type AuditScope = 'account' | 'environment';

export interface AuditActor {
    type: AuditActorType;
    id: string;
    display?: string;
}

export interface AuditTarget {
    type: AuditTargetType;
    id: string;
    display?: string;
}

export interface AuditContext {
    ip?: string;
    userAgent?: string;
}

// Every endpoint declares an audit policy on its `ApiEndpoint` definition: either the audit event it
// records (`AuditEndpointPolicy`) or an explicit `NoAudit` opt-out. This makes audit coverage a
// compile-time decision — a customer endpoint cannot be added without consciously opting in or out.
export interface AuditEndpointPolicy {
    kind: 'audit';
    resource: AuditResource;
    action: AuditAction;
    scope: AuditScope;
}
export interface NoAudit<Reason extends string = 'non-auditable'> {
    kind: 'no-audit';
    reason: Reason;
}
export type EndpointAudit = AuditEndpointPolicy | NoAudit<string>;

// Constructors for the policies above — `auditable()` stamps `kind: 'audit'` so each identity is
// authored once (in `auditPolicies`) and referenced from both the endpoint type and the middleware.
export const Audit = {
    auditable: <R extends AuditResource, A extends AuditAction, S extends AuditScope>(policy: {
        resource: R;
        action: A;
        scope: S;
    }): { kind: 'audit'; resource: R; action: A; scope: S } => ({ kind: 'audit', ...policy }),
    notAuditable: <Reason extends string = 'non-auditable'>(reason: Reason = 'non-auditable' as Reason): NoAudit<Reason> => ({ kind: 'no-audit', reason })
} as const;

// The single source of truth for each audited endpoint's identity. Endpoint types reference an entry
// via `typeof auditPolicies.x`; the audit middleware spreads the same entry — so the two cannot drift.
export const auditPolicies = {
    connectionDeleted: Audit.auditable({ resource: 'connection', action: 'deleted', scope: 'environment' }),
    memberRoleChanged: Audit.auditable({ resource: 'member', action: 'role_changed', scope: 'account' })
} as const;

// `type`, not `interface`: an interface has no implicit index signature and so fails the pub/sub
// Serializable payload constraint.
export type AuditRecord = {
    event: string;
};
