// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'system' | 'anonymous';
export type AuditOutcome = 'success' | 'failure' | 'denied';

export type AuditResource =
    | 'connection'
    | 'sync'
    | 'function'
    | 'integration'
    | 'api_key'
    | 'member'
    | 'team'
    | 'user'
    | 'environment'
    | 'app_auth'
    | 'mfa'
    | 'billing'
    | 'audit_log';

export type AuditAction =
    | 'created'
    | 'reauthorized'
    | 'refreshed'
    | 'updated'
    | 'metadata_updated'
    | 'deleted'
    | 'paused'
    | 'started'
    | 'cancelled'
    | 'enabled'
    | 'disabled'
    | 'frequency_changed'
    | 'triggered'
    | 'variant_created'
    | 'variant_deleted'
    | 'upgraded'
    | 'deployed'
    | 'invited'
    | 'invite_accepted'
    | 'invite_declined'
    | 'invite_revoked'
    | 'removed'
    | 'role_changed'
    | 'variables_changed'
    | 'webhook_urls_changed'
    | 'login'
    | 'logout'
    | 'signup'
    | 'password_changed'
    | 'password_reset'
    | 'enrolled'
    | 'recovery_regenerated'
    | 'verified'
    | 'plan_changed'
    | 'trial_extended'
    | 'details_changed'
    | 'payment_method_added'
    | 'payment_method_removed'
    | 'exported';

export type AuditScope = 'account' | 'environment';

export type AuditTargetType = 'connection' | 'sync' | 'function' | 'integration' | 'api_key' | 'member' | 'team' | 'user' | 'environment';

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
// records (`AuditPolicy`) or an explicit `NoAudit` opt-out. This makes audit coverage a compile-time
// decision — a customer endpoint cannot be added without consciously opting in or out. The policy's
// resource/action/scope are captured as type parameters so the endpoint's declaration and the
// middleware spec that services it are checked against each other by the compiler.
export interface AuditPolicy<R extends AuditResource = AuditResource, A extends AuditAction = AuditAction, S extends AuditScope = AuditScope> {
    kind: 'audit';
    resource: R;
    action: A;
    scope: S;
}
export interface NoAudit<Reason extends string = 'non-auditable'> {
    kind: 'no-audit';
    reason: Reason;
}
export type EndpointAudit = AuditPolicy | NoAudit<string>;

// `type`, not `interface`: an interface has no implicit index signature and so fails the pub/sub
// Serializable payload constraint.
export type SerializedAuditEvent = {
    event: string;
};
