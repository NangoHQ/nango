import type { FunctionSource } from '@nangohq/types';

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

export interface AuditTrailFiltersMetadata {
    // No row count on purpose: an audit event records what was asked for, not how much came back.
    from?: string;
    to?: string;
    resources?: string[];
    actions?: string[];
}

export interface AuditTrailQueriedMetadata extends AuditTrailFiltersMetadata {
    // A page of an earlier query rather than a new one, so one browsing session can be collapsed.
    continued?: boolean;
}

export interface MemberInvitedMetadata {
    role?: string;
}

export interface FunctionDeployedMetadata {
    source?: FunctionSource;
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}

export interface FunctionUpgradedMetadata {
    upgradeVersion?: string;
}

export interface FunctionDeletedMetadata {
    // Recorded as-is from the request; intentionally not narrowed so unexpected values still surface.
    type?: string;
}

export interface ApiKeyUpdatedMetadata {
    displayName?: string;
    scopes?: string[];
}

export interface SyncBaseMetadata {
    providerConfigKey?: string;
    connectionId?: string;
}

export interface SyncFrequencyChangedMetadata extends SyncBaseMetadata {
    frequency?: string;
}

export interface SyncVariantMetadata extends SyncBaseMetadata {
    variant?: string;
}

export interface SyncTriggeredMetadata extends SyncBaseMetadata {
    // The options the caller asked for, not what the run did with them.
    reset?: boolean;
    emptyCache?: boolean;
}

export interface MemberRoleChangedMetadata {
    fromRole?: string;
    toRole?: string;
}

export interface TeamUpdatedMetadata {
    name?: string;
}

export interface UserUpdatedMetadata {
    name?: string;
    gettingStartedClosed?: boolean;
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
    changedFields?: string[];
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
