import type {
    ApiKeyUpdatedMetadata,
    AppAuthLoginMetadata,
    AuditTrailFiltersMetadata,
    AuditTrailQueriedMetadata,
    BillingPaymentMethodRemovedMetadata,
    BillingPlanChangedMetadata,
    BillingSpendAlertChangedMetadata,
    ConnectionMetadata,
    ConnectionUpdatedMetadata,
    EnvironmentCreatedMetadata,
    EnvironmentUpdatedMetadata,
    EnvironmentVariablesChangedMetadata,
    EnvironmentWebhookMetadata,
    FunctionDeletedMetadata,
    FunctionDeployedMetadata,
    FunctionUpgradedMetadata,
    IntegrationProviderMetadata,
    IntegrationUpdatedMetadata,
    MemberInvitedMetadata,
    MemberRoleChangedMetadata,
    MfaVerifiedMetadata,
    SyncBaseMetadata,
    SyncFrequencyChangedMetadata,
    SyncTriggeredMetadata,
    SyncVariantMetadata,
    TeamUpdatedMetadata,
    UserUpdatedMetadata
} from './metadata.js';

// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'public_key' | 'connect_session' | 'anonymous' | 'unknown';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditViaType = 'impersonation';
export type AuditInterface = 'api' | 'mcp';

// The audit vocabulary AND the metadata each action may carry — one table, so an action cannot exist
// without a declared payload shape, and a shape cannot be declared for an action that does not exist.
// `never` means the action carries no metadata.
interface AuditEventTable {
    connection: {
        created: ConnectionMetadata;
        updated: ConnectionUpdatedMetadata;
        metadata_updated: ConnectionMetadata;
        refreshed: ConnectionMetadata;
        deleted: ConnectionMetadata;
    };
    sync: {
        enabled: SyncBaseMetadata;
        disabled: SyncBaseMetadata;
        paused: SyncBaseMetadata;
        started: SyncBaseMetadata;
        triggered: SyncTriggeredMetadata;
        cancelled: SyncBaseMetadata;
        frequency_changed: SyncFrequencyChangedMetadata;
        variant_created: SyncVariantMetadata;
        variant_deleted: SyncVariantMetadata;
    };
    function: {
        deployed: FunctionDeployedMetadata;
        upgraded: FunctionUpgradedMetadata;
        deleted: FunctionDeletedMetadata;
    };
    integration: {
        created: IntegrationProviderMetadata;
        updated: IntegrationProviderMetadata & IntegrationUpdatedMetadata;
        deleted: IntegrationProviderMetadata;
    };
    api_key: {
        created: ApiKeyUpdatedMetadata;
        updated: ApiKeyUpdatedMetadata;
        deleted: never;
    };
    member: {
        invited: MemberInvitedMetadata;
        invite_accepted: never;
        invite_declined: never;
        invite_revoked: never;
        role_changed: MemberRoleChangedMetadata;
        removed: never;
    };
    team: {
        updated: TeamUpdatedMetadata;
    };
    user: {
        updated: UserUpdatedMetadata;
    };
    environment: {
        created: EnvironmentCreatedMetadata;
        updated: EnvironmentUpdatedMetadata;
        variables_changed: EnvironmentVariablesChangedMetadata;
        webhook_urls_changed: EnvironmentWebhookMetadata;
        webhook_signing_key_rotated: never;
        deleted: never;
    };
    app_auth: {
        login: AppAuthLoginMetadata;
        logout: never;
        signup: never;
        password_changed: never;
        password_reset: never;
    };
    mfa: {
        enrolled: never;
        enabled: never;
        disabled: never;
        verified: MfaVerifiedMetadata;
        recovery_regenerated: never;
    };
    billing: {
        plan_changed: BillingPlanChangedMetadata;
        trial_extended: never;
        details_changed: never;
        payment_method_added: never;
        payment_method_removed: BillingPaymentMethodRemovedMetadata;
        spend_alert_changed: BillingSpendAlertChangedMetadata;
        spend_alert_removed: never;
    };
    audit_trail: {
        exported: AuditTrailFiltersMetadata;
        queried: AuditTrailQueriedMetadata;
    };
}

export type AuditResource = keyof AuditEventTable;
// Distributive on purpose: `keyof` a union of objects is the INTERSECTION of their keys, so
// AuditActionOf<AuditResource> would otherwise collapse to the actions every resource happens to share.
export type AuditActionOf<R extends AuditResource> = R extends AuditResource ? keyof AuditEventTable[R] & string : never;
export type AuditAction = AuditActionOf<AuditResource>;

export type AuditEventKey = { [R in AuditResource]: `${R}.${AuditActionOf<R>}` }[AuditResource];

/** The metadata an action may carry. `never` for the actions that carry none. */
export type AuditMetadataFor<R extends AuditResource, A> = A extends keyof AuditEventTable[R] ? AuditEventTable[R][A] : never;

export type AuditScope = 'account' | 'environment';

export type AuditTargetType = 'connection' | 'sync' | 'function' | 'integration' | 'api_key' | 'member' | 'team' | 'user' | 'environment';

export interface AuditActor {
    type: AuditActorType;
    id: string;
    display?: string;
}

export interface AuditVia {
    type: AuditViaType;
    id: string;
    display?: string;
    // Identifies the operator to Nango without disclosing them to the customer, so an id and never a name.
    actorId?: string;
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
    kind: 'request';
    actor: AuditActor;
    context: AuditContext;
}

// The counterpart: a flow that states it is not attributing, and why. Provider webhooks reach the hook with
// no request at all; keeping it a decision means a new flow cannot silently forget to attribute.
export interface NoAttribution {
    kind: 'no-attribution';
    reason: string;
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

// Derived from the vocabulary, so the union and the metadata it carries cannot disagree.
export type AuditResourceAction = {
    [R in AuditResource]: {
        [A in AuditActionOf<R>]: [AuditMetadataFor<R, A>] extends [never]
            ? { resource: R; action: A }
            : { resource: R; action: A; metadata?: AuditMetadataFor<R, A> };
    }[AuditActionOf<R>];
}[AuditResource];

interface AuditEventCommon {
    occurredAt: string;
    accountId: number;
    scope: AuditScope;
    environment: { id: string; display: string } | null;
    actor: AuditActor;
    via?: AuditVia[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
}

export type AuditEvent = AuditEventCommon & AuditResourceAction;

export type StoredAuditEvent = AuditEvent & { id: string; version: AuditTrailVersion };
