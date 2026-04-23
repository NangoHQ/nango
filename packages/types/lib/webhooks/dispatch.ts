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
    /** ISO timestamp of when the server built the message. */
    createdAt: string;
    /**
     * Server-generated UUID created at the start of the inbound webhook HTTP request.
     * Different for every request — including provider retries — because P1 does not
     * dedupe across separate ingress requests.
     */
    ingressRequestId: string;
    accountId: number;
    environmentId: number;
    integrationId: number;
    provider: string;
    providerConfigKey: string;
    parentSyncName: string;
    /** Log context id created by the server before publishing; threaded through to the webhook runner. */
    activityLogId: string;
    webhookName: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
    payload: unknown;
}
