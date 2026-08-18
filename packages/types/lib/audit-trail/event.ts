// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'connect_session' | 'anonymous' | 'unknown';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditInterface = 'api' | 'mcp';

interface AuditEventTable {
    connection: 'created' | 'updated' | 'metadata_updated' | 'refreshed' | 'deleted';
    sync: 'enabled' | 'disabled' | 'paused' | 'started' | 'triggered' | 'cancelled' | 'frequency_changed' | 'variant_created' | 'variant_deleted';
    function: 'deployed' | 'upgraded' | 'deleted';
    integration: 'created' | 'updated' | 'deleted';
    api_key: 'created' | 'updated' | 'deleted';
    member: 'invited' | 'invite_accepted' | 'invite_declined' | 'invite_revoked' | 'role_changed' | 'removed';
    team: 'updated';
    user: 'updated';
    environment: 'created' | 'updated' | 'variables_changed' | 'webhook_urls_changed' | 'webhook_signing_key_rotated' | 'deleted';
    app_auth: 'login' | 'logout' | 'signup' | 'password_changed' | 'password_reset';
    mfa: 'enrolled' | 'enabled' | 'disabled' | 'verified' | 'recovery_regenerated';
    billing: 'plan_changed' | 'trial_extended' | 'details_changed' | 'payment_method_added' | 'payment_method_removed';
}

export type AuditResource = keyof AuditEventTable;
export type AuditActionOf<R extends AuditResource> = AuditEventTable[R];
export type AuditAction = AuditActionOf<AuditResource>;

export type AuditEventKey = { [R in AuditResource]: `${R}.${AuditEventTable[R]}` }[AuditResource];

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
    // Optional because events recorded before interface attribution was introduced do not have it.
    interface?: AuditInterface;
    ip?: string;
    userAgent?: string;
}

// Resolved at the route and carried to the connectionCreated hook, its only user today, because a hook has no
// request of its own to attribute the caller from.
export interface AuditAttribution {
    actor: AuditActor;
    context: AuditContext;
}

// Every endpoint declares an audit policy on its `ApiEndpoint` definition: either the audit event it
// records (`AuditPolicy`) or an explicit `NoAudit` opt-out. This makes audit coverage a compile-time
// decision — a customer endpoint cannot be added without consciously opting in or out. The policy's
// resource/action/scope are captured as type parameters so the endpoint's declaration and the
// middleware spec that services it are checked against each other by the compiler.
export interface AuditPolicy<R extends AuditResource = AuditResource, A extends AuditActionOf<R> = AuditActionOf<R>, S extends AuditScope = AuditScope> {
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
