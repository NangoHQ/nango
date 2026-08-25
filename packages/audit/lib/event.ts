// `id` and `version` are stamped at the emit boundary, not by the caller.

import type { AuditActor, AuditContext, AuditEventKey, AuditOutcome, AuditTarget, AuditTrailVersion, AuditVia } from '@nangohq/types';

export type {
    AuditActor,
    AuditActorType,
    AuditAttribution,
    NoAttribution,
    AuditContext,
    AuditEventKey,
    AuditInterface,
    AuditOutcome,
    AuditTarget,
    AuditTargetType,
    AuditVia,
    AuditResource,
    AuditAction,
    AuditTrailVersion
} from '@nangohq/types';

interface ConnectionMetadata {
    providerConfigKey?: string;
}
interface ConnectionUpdatedMetadata {
    providerConfigKey?: string;
    changedFields?: string[];
}
interface IntegrationCreatedMetadata {
    provider?: string;
}
interface IntegrationUpdatedMetadata {
    changedFields?: string[];
}
interface EnvironmentCreatedMetadata {
    name?: string;
}
interface AuditTrailFiltersMetadata {
    // No row count on purpose: an audit event records what was asked for, not how much came back.
    from?: string;
    to?: string;
    resources?: string[];
    actions?: string[];
}
interface AuditTrailQueriedMetadata extends AuditTrailFiltersMetadata {
    // A page of an earlier query rather than a new one, so one browsing session can be collapsed.
    continued?: boolean;
}
interface MemberInvitedMetadata {
    role?: string;
}
interface FunctionDeployedMetadata {
    providerConfigKey?: string;
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}
interface FunctionUpgradedMetadata {
    providerConfigKey?: string;
    upgradeVersion?: string;
}
interface FunctionDeletedMetadata {
    providerConfigKey?: string;
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}
interface ApiKeyUpdatedMetadata {
    displayName?: string;
    scopes?: string[];
}
interface SyncBaseMetadata {
    providerConfigKey?: string;
    connectionId?: string;
}
interface SyncFrequencyChangedMetadata extends SyncBaseMetadata {
    frequency?: string;
}
interface SyncVariantMetadata extends SyncBaseMetadata {
    variant?: string;
}
interface SyncTriggeredMetadata extends SyncBaseMetadata {
    // The options the caller asked for, not what the run did with them.
    reset?: boolean;
    emptyCache?: boolean;
}
interface MemberRoleChangedMetadata {
    fromRole?: string;
    toRole?: string;
}
interface TeamUpdatedMetadata {
    name?: string;
}
interface EnvironmentUpdatedMetadata {
    name?: string;
    changedFields?: string[];
}
interface EnvironmentVariablesChangedMetadata {
    variableCount?: number;
    variableNames?: string[];
}
interface EnvironmentWebhookMetadata {
    primaryUrl?: string;
    secondaryUrl?: string;
}
interface BillingPlanChangedMetadata {
    fromPlan?: string;
    toPlan?: string;
}
export type AppAuthLoginMethod = 'local' | 'sso' | 'managed';
interface AppAuthLoginMetadata {
    mfaRequired?: boolean;
    method?: AppAuthLoginMethod;
}
interface BillingPaymentMethodRemovedMetadata {
    // Opaque Stripe payment method id (`pm_...`); never card number, brand, or last4.
    paymentMethodId?: string;
}
export interface MfaVerifiedMetadata {
    method?: 'totp' | 'recovery_code';
}

interface AuditEventCommon {
    occurredAt: string;
    accountId: number;
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditVia[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
}

export type AuditResourceAction =
    | { resource: 'connection'; action: 'created'; metadata?: ConnectionMetadata }
    | { resource: 'connection'; action: 'refreshed' | 'metadata_updated' | 'deleted'; metadata?: ConnectionMetadata }
    | { resource: 'connection'; action: 'updated'; metadata?: ConnectionUpdatedMetadata }
    | { resource: 'integration'; action: 'created'; metadata?: IntegrationCreatedMetadata }
    | { resource: 'integration'; action: 'updated'; metadata?: IntegrationUpdatedMetadata }
    | { resource: 'integration'; action: 'deleted' }
    | { resource: 'function'; action: 'deployed'; metadata?: FunctionDeployedMetadata }
    | { resource: 'function'; action: 'upgraded'; metadata?: FunctionUpgradedMetadata }
    | { resource: 'function'; action: 'deleted'; metadata?: FunctionDeletedMetadata }
    | { resource: 'api_key'; action: 'created'; metadata?: ApiKeyUpdatedMetadata }
    | { resource: 'api_key'; action: 'updated'; metadata?: ApiKeyUpdatedMetadata }
    | { resource: 'api_key'; action: 'deleted' }
    | { resource: 'sync'; action: 'paused' | 'started' | 'enabled' | 'disabled'; metadata?: SyncBaseMetadata }
    | { resource: 'sync'; action: 'frequency_changed'; metadata?: SyncFrequencyChangedMetadata }
    | { resource: 'sync'; action: 'variant_created' | 'variant_deleted'; metadata?: SyncVariantMetadata }
    | { resource: 'member'; action: 'invited'; metadata?: MemberInvitedMetadata }
    | { resource: 'member'; action: 'invite_accepted' | 'invite_declined' }
    | { resource: 'member'; action: 'invite_revoked' }
    | { resource: 'sync'; action: 'triggered'; metadata?: SyncTriggeredMetadata }
    | { resource: 'sync'; action: 'cancelled'; metadata?: SyncBaseMetadata }
    | { resource: 'member'; action: 'removed' }
    | { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata }
    | { resource: 'team'; action: 'updated'; metadata?: TeamUpdatedMetadata }
    | { resource: 'user'; action: 'updated' }
    | { resource: 'environment'; action: 'created'; metadata?: EnvironmentCreatedMetadata }
    | { resource: 'environment'; action: 'deleted' }
    | { resource: 'environment'; action: 'webhook_urls_changed'; metadata?: EnvironmentWebhookMetadata }
    | { resource: 'environment'; action: 'updated'; metadata?: EnvironmentUpdatedMetadata }
    | { resource: 'environment'; action: 'variables_changed'; metadata?: EnvironmentVariablesChangedMetadata }
    | { resource: 'environment'; action: 'webhook_signing_key_rotated' }
    | { resource: 'billing'; action: 'trial_extended' | 'details_changed' | 'payment_method_added' | 'spend_alert_changed' | 'spend_alert_removed' }
    | { resource: 'audit_trail'; action: 'exported'; metadata?: AuditTrailFiltersMetadata }
    | { resource: 'audit_trail'; action: 'queried'; metadata?: AuditTrailQueriedMetadata }
    | { resource: 'billing'; action: 'plan_changed'; metadata?: BillingPlanChangedMetadata }
    | { resource: 'billing'; action: 'payment_method_removed'; metadata?: BillingPaymentMethodRemovedMetadata }
    | { resource: 'app_auth'; action: 'login'; metadata?: AppAuthLoginMetadata }
    | { resource: 'app_auth'; action: 'password_changed' | 'logout' | 'signup' | 'password_reset' }
    | { resource: 'mfa'; action: 'enrolled' | 'enabled' | 'disabled' | 'recovery_regenerated' }
    | { resource: 'mfa'; action: 'verified'; metadata?: MfaVerifiedMetadata };

type EmittedKey<T extends { resource: string; action: string }> = T extends unknown ? `${T['resource']}.${T['action']}` : never;

type EmittedButNotInVocabulary = Exclude<EmittedKey<AuditResourceAction>, AuditEventKey>;
type InVocabularyButNotEmitted = Exclude<AuditEventKey, EmittedKey<AuditResourceAction>>;

true satisfies [EmittedButNotInVocabulary, InVocabularyButNotEmitted] extends [never, never] ? true : never;

export type AuditEvent = AuditEventCommon & AuditResourceAction;

export type StoredAuditEvent = AuditEvent & { id: string; version: AuditTrailVersion };
