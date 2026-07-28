// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'system';
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
    | 'invite_revoked'
    | 'removed'
    | 'role_changed'
    | 'variables_changed'
    | 'webhook_urls_changed'
    | 'login'
    | 'login_failed'
    | 'logout'
    | 'signup'
    | 'password_changed'
    | 'password_reset'
    | 'plan_changed'
    | 'trial_extended'
    | 'details_changed'
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
    connectionRefreshed: Audit.auditable({ resource: 'connection', action: 'refreshed', scope: 'environment' }),
    connectionUpdated: Audit.auditable({ resource: 'connection', action: 'updated', scope: 'environment' }),
    connectionMetadataUpdated: Audit.auditable({ resource: 'connection', action: 'metadata_updated', scope: 'environment' }),
    connectionDeleted: Audit.auditable({ resource: 'connection', action: 'deleted', scope: 'environment' }),
    integrationUpdated: Audit.auditable({ resource: 'integration', action: 'updated', scope: 'environment' }),
    integrationDeleted: Audit.auditable({ resource: 'integration', action: 'deleted', scope: 'environment' }),
    functionDeleted: Audit.auditable({ resource: 'function', action: 'deleted', scope: 'environment' }),
    apiKeyUpdated: Audit.auditable({ resource: 'api_key', action: 'updated', scope: 'environment' }),
    apiKeyDeleted: Audit.auditable({ resource: 'api_key', action: 'deleted', scope: 'environment' }),
    syncEnabled: Audit.auditable({ resource: 'sync', action: 'enabled', scope: 'environment' }),
    syncDisabled: Audit.auditable({ resource: 'sync', action: 'disabled', scope: 'environment' }),
    syncFrequencyChanged: Audit.auditable({ resource: 'sync', action: 'frequency_changed', scope: 'environment' }),
    syncVariantCreated: Audit.auditable({ resource: 'sync', action: 'variant_created', scope: 'environment' }),
    syncVariantDeleted: Audit.auditable({ resource: 'sync', action: 'variant_deleted', scope: 'environment' }),
    memberRemoved: Audit.auditable({ resource: 'member', action: 'removed', scope: 'account' }),
    memberRoleChanged: Audit.auditable({ resource: 'member', action: 'role_changed', scope: 'account' }),
    teamUpdated: Audit.auditable({ resource: 'team', action: 'updated', scope: 'account' }),
    userUpdated: Audit.auditable({ resource: 'user', action: 'updated', scope: 'account' }),
    environmentDeleted: Audit.auditable({ resource: 'environment', action: 'deleted', scope: 'environment' }),
    environmentUpdated: Audit.auditable({ resource: 'environment', action: 'updated', scope: 'environment' }),
    environmentVariablesChanged: Audit.auditable({ resource: 'environment', action: 'variables_changed', scope: 'environment' }),
    environmentWebhookUrlsChanged: Audit.auditable({ resource: 'environment', action: 'webhook_urls_changed', scope: 'environment' }),
    billingPlanChanged: Audit.auditable({ resource: 'billing', action: 'plan_changed', scope: 'account' }),
    billingTrialExtended: Audit.auditable({ resource: 'billing', action: 'trial_extended', scope: 'account' }),
    billingDetailsChanged: Audit.auditable({ resource: 'billing', action: 'details_changed', scope: 'account' }),
    appAuthPasswordChanged: Audit.auditable({ resource: 'app_auth', action: 'password_changed', scope: 'account' })
} as const;
