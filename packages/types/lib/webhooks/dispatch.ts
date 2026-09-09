import type { FunctionTrigger } from '../function/trigger.js';
import type { JsonValue } from 'type-fest';

interface DispatchMessageBase {
    version: 1;
    createdAt: string;
    accountId: number;
    integrationId: number;
    provider: string;
    /** Activity log created before enqueue and reused by the eventual execution. */
    activityLogId: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
}

/**
 * SQS message envelope for the webhook task-dispatch queue.
 *
 * The server produces one of these per (syncConfig × webhook subscription × connection)
 * triple resulting from an inbound provider webhook. The jobs consumer parses these and
 * calls the orchestrator to schedule the legacy webhook task using `taskName` as its
 * task name.
 */
export interface LegacyDispatchMessage extends DispatchMessageBase {
    kind: 'webhook';
    /** Deterministic scheduler task name used to deduplicate queue redeliveries. */
    taskName: string;
    parentSyncName: string;
    /** Webhook subscription name matched on the inbound payload; passed to executeWebhook as args.webhookName. */
    webhookName: string;
    payload: JsonValue;
}

export interface FunctionDispatchMessage extends DispatchMessageBase {
    kind: 'function';
    /** Deterministic key used to deduplicate queue redeliveries. */
    idempotencyKey: string;
    functionName: string;
    trigger: Omit<Extract<FunctionTrigger, { kind: 'http' }>, 'request' | 'connection'> & {
        request: Extract<FunctionTrigger, { kind: 'http' }>['request'];
        subscriptions: string[];
        connection: NonNullable<Extract<FunctionTrigger, { kind: 'http' }>['connection']>;
    };
    maxConcurrency: number;
}

export type DispatchMessage = LegacyDispatchMessage | FunctionDispatchMessage;
