export interface BillingClient {
    ingest: (events: BillingIngestEvent[]) => Promise<void>;
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
