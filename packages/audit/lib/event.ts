// `id` and `version` are stamped at the emit boundary, not by the caller.

import type { AuditActor, AuditContext, AuditEventKey, AuditOutcome, AuditTarget, AuditTrailVersion } from '@nangohq/types';

export type {
    AuditActor,
    AuditActorType,
    AuditContext,
    AuditEventKey,
    AuditInterface,
    AuditOutcome,
    AuditTarget,
    AuditTargetType,
    AuditResource,
    AuditAction,
    AuditTrailVersion
} from '@nangohq/types';

export interface ConnectionMetadata {
    providerConfigKey?: string;
}
export interface ConnectionUpdatedMetadata {
    providerConfigKey?: string;
    changedFields?: string[];
}
export interface IntegrationCreatedMetadata {
    provider?: string;
}
export interface IntegrationUpdatedMetadata {
    changedFields?: string[];
}
export interface EnvironmentCreatedMetadata {
    name?: string;
}
export interface MemberInvitedMetadata {
    role?: string;
}
export interface FunctionDeployedMetadata {
    providerConfigKey?: string;
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}
export interface FunctionUpgradedMetadata {
    providerConfigKey?: string;
    upgradeVersion?: string;
}
export interface FunctionDeletedMetadata {
    providerConfigKey?: string;
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}
export interface ApiKeyUpdatedMetadata {
    displayName?: string;
    scopes?: string[];
}
export interface SyncStateMetadata {
    providerConfigKey?: string;
}
export interface SyncFrequencyChangedMetadata {
    providerConfigKey?: string;
    frequency?: string;
}
export interface SyncVariantMetadata {
    variant?: string;
}
export interface SyncTriggeredMetadata {
    full?: boolean;
    deleteRecords?: boolean;
    variant?: string;
}
export interface MemberRoleChangedMetadata {
    fromRole?: string;
    toRole?: string;
}
export interface TeamUpdatedMetadata {
    name?: string;
}
export interface EnvironmentUpdatedMetadata {
    name?: string;
    changedFields?: string[];
}
export interface EnvironmentVariablesChangedMetadata {
    variableCount?: number;
    variableNames?: string[];
}
export interface EnvironmentWebhookMetadata {
    primaryUrl?: string;
    secondaryUrl?: string;
}
export interface BillingPlanChangedMetadata {
    fromPlan?: string;
    toPlan?: string;
}
export type AppAuthLoginMethod = 'local' | 'sso' | 'managed';
export interface AppAuthLoginMetadata {
    mfaRequired?: boolean;
    method?: AppAuthLoginMethod;
}
export interface BillingPaymentMethodRemovedMetadata {
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
    via?: AuditActor[];
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
    | { resource: 'sync'; action: 'paused' | 'started'; metadata?: SyncStateMetadata }
    | { resource: 'sync'; action: 'enabled' | 'disabled' }
    | { resource: 'sync'; action: 'frequency_changed'; metadata?: SyncFrequencyChangedMetadata }
    | { resource: 'sync'; action: 'variant_created' | 'variant_deleted'; metadata?: SyncVariantMetadata }
    | { resource: 'member'; action: 'invited'; metadata?: MemberInvitedMetadata }
    | { resource: 'member'; action: 'invite_accepted' | 'invite_declined' }
    | { resource: 'member'; action: 'invite_revoked' }
    | { resource: 'sync'; action: 'triggered'; metadata?: SyncTriggeredMetadata }
    | { resource: 'sync'; action: 'cancelled' }
    | { resource: 'member'; action: 'removed' }
    | { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata }
    | { resource: 'team'; action: 'updated'; metadata?: TeamUpdatedMetadata }
    | { resource: 'user'; action: 'updated' }
    | { resource: 'environment'; action: 'created'; metadata?: EnvironmentCreatedMetadata }
    | { resource: 'environment'; action: 'deleted' }
    | { resource: 'environment'; action: 'webhook_urls_changed'; metadata?: EnvironmentWebhookMetadata }
    | { resource: 'environment'; action: 'updated'; metadata?: EnvironmentUpdatedMetadata }
    | { resource: 'environment'; action: 'variables_changed'; metadata?: EnvironmentVariablesChangedMetadata }
    | { resource: 'billing'; action: 'trial_extended' | 'details_changed' | 'payment_method_added' }
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
