// `id` and `version` are stamped downstream by the store at write, not by the caller.

import type { AuditActor, AuditContext, AuditOutcome, AuditTarget } from '@nangohq/types';

export type {
    AuditActor,
    AuditActorType,
    AuditContext,
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
export interface IntegrationUpdatedMetadata {
    changedFields?: string[];
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
export interface SyncFrequencyChangedMetadata {
    providerConfigKey?: string;
    frequency?: string;
}
export interface SyncStateMetadata {
    providerConfigKey?: string;
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
    | { resource: 'connection'; action: 'refreshed' | 'metadata_updated' | 'deleted'; metadata?: ConnectionMetadata }
    | { resource: 'connection'; action: 'updated'; metadata?: ConnectionUpdatedMetadata }
    | { resource: 'integration'; action: 'updated'; metadata?: IntegrationUpdatedMetadata }
    | { resource: 'integration'; action: 'deleted' }
    | { resource: 'function'; action: 'deleted'; metadata?: FunctionDeletedMetadata }
    | { resource: 'api_key'; action: 'updated'; metadata?: ApiKeyUpdatedMetadata }
    | { resource: 'api_key'; action: 'deleted' }
    | { resource: 'sync'; action: 'enabled' | 'disabled' }
    | { resource: 'sync'; action: 'frequency_changed'; metadata?: SyncFrequencyChangedMetadata }
    | { resource: 'sync'; action: 'variant_created' | 'variant_deleted'; metadata?: SyncVariantMetadata }
    | { resource: 'sync'; action: 'paused' | 'started'; metadata?: SyncStateMetadata }
    | { resource: 'sync'; action: 'triggered'; metadata?: SyncTriggeredMetadata }
    | { resource: 'sync'; action: 'cancelled' }
    | { resource: 'member'; action: 'removed' }
    | { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata }
    | { resource: 'team'; action: 'updated'; metadata?: TeamUpdatedMetadata }
    | { resource: 'user'; action: 'updated' }
    | { resource: 'environment'; action: 'deleted' }
    | { resource: 'environment'; action: 'webhook_urls_changed'; metadata?: EnvironmentWebhookMetadata }
    | { resource: 'environment'; action: 'updated'; metadata?: EnvironmentUpdatedMetadata }
    | { resource: 'environment'; action: 'variables_changed'; metadata?: EnvironmentVariablesChangedMetadata }
    | { resource: 'billing'; action: 'trial_extended' | 'details_changed' }
    | { resource: 'billing'; action: 'plan_changed'; metadata?: BillingPlanChangedMetadata }
    | { resource: 'app_auth'; action: 'password_changed' };

export type AuditEvent = AuditEventCommon & AuditResourceAction;
