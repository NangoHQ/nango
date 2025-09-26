import type { Result } from '../result.js';
import type { DBTeam } from '../team/db.js';
import type { DBUser } from '../user/db.js';

export interface BillingClient {
    ingest: (events: BillingEvent[]) => Promise<void>;
    upsertCustomer: (team: DBTeam, user: DBUser) => Promise<Result<BillingCustomer>>;
    updateCustomer: (customerId: string, name: string) => Promise<Result<void>>;
    linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>>;
    getCustomer: (accountId: number) => Promise<Result<BillingCustomer>>;
    getSubscription: (accountId: number) => Promise<Result<BillingSubscription | null>>;
    createSubscription: (team: DBTeam, planExternalId: string) => Promise<Result<BillingSubscription>>;
    getUsage: (subscriptionId: string, period?: 'previous') => Promise<Result<BillingUsageMetric[]>>;
    upgrade: (opts: { subscriptionId: string; planExternalId: string }) => Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>>;
    downgrade: (opts: { subscriptionId: string; planExternalId: string }) => Promise<Result<void>>;
    applyPendingChanges: (opts: {
        pendingChangeId: string;
        /**
         * format: dollar.cent = 0.00
         */
        amount: string;
    }) => Promise<Result<BillingSubscription>>;
    cancelPendingChanges: (opts: { pendingChangeId: string }) => Promise<Result<void>>;
    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true>;
    getPlanById(planId: string): Promise<Result<BillingPlan>>;
}

export interface BillingCustomer {
    id: string;
    portalUrl: string | null;
}

export interface BillingSubscription {
    id: string;
    pendingChangeId?: string | undefined;
    planExternalId: string;
}

export interface BillingUsageMetric {
    id: string;
    name: string;
    quantity: number;
}

export interface BillingPlan {
    id: string;
    external_plan_id: string;
}

type BillingPropertyValue = string | number | boolean | Date | undefined;
type BillingProperties = Record<string, BillingPropertyValue | Record<string, BillingPropertyValue>>;

interface BillingEventBase<TType extends string, TProperties extends BillingProperties = BillingProperties> {
    type: TType;
    properties: {
        timestamp: Date;
        idempotencyKey?: string | undefined;
        accountId: number;
        count: number;
    } & TProperties;
}

export type MarBillingEvent = BillingEventBase<
    'monthly_active_records',
    {
        connectionId: number;
        environmentId: number;
        providerConfigKey: string;
        syncId: string;
        model: string;
    }
>;

export type RecordsBillingEvent = BillingEventBase<
    'records',
    {
        environmentId: number;
        frequencyMs: number;
        telemetry: {
            sizeBytes: number;
        };
    }
>;

export type ActionsBillingEvent = BillingEventBase<
    'billable_actions',
    {
        connectionId: number;
        environmentId: number;
        providerConfigKey: string;
        actionName: string;
    }
>;

export type FunctionExecutionsBillingEvent = BillingEventBase<
    'function_executions',
    {
        type: string;
        connectionId: number;
        telemetry: {
            successes: number;
            failures: number;
            durationMs: number;
            compute: number;
            customLogs: number;
            proxyCalls: number;
        };
        frequencyMs?: number | undefined;
    }
>;

export type ProxyBillingEvent = BillingEventBase<
    'proxy',
    {
        connectionId: number;
        environmentId: number;
        providerConfigKey: string;
        provider: string;
        telemetry: {
            successes: number;
            failures: number;
        };
    }
>;

export type WebhookForwardBillingEvent = BillingEventBase<
    'webhook_forwards',
    {
        environmentId: number;
        providerConfigKey: string;
        provider: string;
        telemetry: {
            successes: number;
            failures: number;
        };
    }
>;

export type ConnectionsBillingEvent = BillingEventBase<'billable_connections'>;

export type ConnectionsBillingEventV2 = BillingEventBase<
    'billable_connections_v2',
    {
        frequencyMs: number;
    }
>;

export type ActiveConnectionsBillingEvent = BillingEventBase<'billable_active_connections'>;

export type BillingEvent =
    | MarBillingEvent
    | RecordsBillingEvent
    | ActionsBillingEvent
    | ProxyBillingEvent
    | WebhookForwardBillingEvent
    | FunctionExecutionsBillingEvent
    | ConnectionsBillingEvent
    | ConnectionsBillingEventV2
    | ActiveConnectionsBillingEvent;
