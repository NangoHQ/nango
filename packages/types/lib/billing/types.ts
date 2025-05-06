import type { Result } from '../result';

export interface BillingClient {
    ingest: (events: BillingIngestEvent[]) => Promise<void>;
    getCustomer: (accountId: number) => Promise<Result<BillingCustomer>>;
    getSubscription: (accountId: number) => Promise<Result<BillingSubscription | null>>;
    getUsage: (subscriptionId: string, period?: 'previous') => Promise<Result<BillingUsageMetric[]>>;
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

export interface BillingIngestEvent {
    type: 'monthly_active_records' | 'billable_connections' | 'billable_actions';
    idempotencyKey: string;
    accountId: number;
    timestamp: Date;
    properties: Record<string, string | number>;
}

export interface BillingMetric {
    type: BillingIngestEvent['type'];
    value: number;
    properties: { accountId: number; timestamp?: Date | undefined; idempotencyKey?: string | undefined };
}
