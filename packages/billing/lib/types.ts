export interface BillingClient {
    ingest: (events: IngestEvent[]) => Promise<void>;
}

export interface IngestEvent {
    type: 'monthly_active_records' | 'billable_connections' | 'billable_actions';
    idempotencyKey: string;
    accountId: number;
    timestamp: Date;
    properties: Record<string, string | number>;
}

export interface BillingMetric {
    type: IngestEvent['type'];
    value: number;
    properties: { accountId: number; timestamp?: Date | undefined; idempotencyKey?: string | undefined };
}
