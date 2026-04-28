/**
 * SQS message envelope for the webhook task-dispatch queue.
 *
 * The server produces one of these per (syncConfig × webhook subscription × connection)
 * triple resulting from an inbound provider webhook. The jobs consumer parses these and
 * calls the orchestrator to schedule the actual webhook task using `taskName` as the
 * idempotency key.
 */
export interface WebhookDispatchMessage {
    version: 1;
    kind: 'webhook';
    /**
     * Deterministic scheduler task name; used by the orchestrator as the
     * idempotency key so duplicate SQS deliveries resolve to the same task.
     */
    taskName: string;
    createdAt: string;
    accountId: number;
    integrationId: number;
    provider: string;
    parentSyncName: string;
    /** Webhook subscription name matched on the inbound payload; passed to executeWebhook as args.webhookName. */
    webhookName: string;
    /** Activity log id created before enqueue; also reused as the taskName dedupe seed. */
    activityLogId: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
    payload: unknown;
}
