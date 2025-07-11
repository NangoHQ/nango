import type { Result } from '../result.js';
import type { DBTeam } from '../team/db.js';
import type { DBUser } from '../user/db.js';

export interface BillingClient {
    ingest: (events: BillingIngestEvent[]) => Promise<void>;
    upsertCustomer: (team: DBTeam, user: DBUser) => Promise<Result<BillingCustomer>>;
    linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>>;
    getCustomer: (accountId: number) => Promise<Result<BillingCustomer>>;
    getSubscription: (accountId: number) => Promise<Result<BillingSubscription | null>>;
    createSubscription: (team: DBTeam, planExternalId: string) => Promise<Result<BillingSubscription>>;
    getUsage: (subscriptionId: string, period?: 'previous') => Promise<Result<BillingUsageMetric[]>>;
    upgrade: (opts: { subscriptionId: string; planExternalId: string; immediate: boolean }) => Promise<Result<void>>;
    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true>;
    getPlanById(planId: string): Promise<Result<BillingPlan>>;
}

export interface BillingCustomer {
    id: string;
    portalUrl: string | null;
}

export interface BillingSubscription {
    id: string;
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

export interface BillingIngestEvent {
    type: 'monthly_active_records' | 'billable_connections' | 'billable_actions' | 'billable_active_connections';
    idempotencyKey: string;
    accountId: number;
    timestamp: Date;
    properties: Record<string, string | number | Date>;
}

export interface BillingMetric {
    type: BillingIngestEvent['type'];
    value: number;
    properties: { accountId: number; timestamp?: Date | undefined; idempotencyKey?: string | undefined } & BillingIngestEvent['properties'];
}
