import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { InternalNango } from './internal-nango.js';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, string>,
    body: T,
    rawBody: string,
    logContextGetter: LogContextGetter
) => Promise<WebhookResponse>;

// Base response type that all webhook responses must include
export interface WebhookResponseOnly {
    response: string | Record<string, any> | null;
    statusCode: number;
}

// Union type for all possible webhook response structures
export type WebhookResponse =
    | WebhookResponseOnly
    | (WebhookResponseOnly & { connectionIds: string[] })
    | (WebhookResponseOnly & { toForward: unknown; connectionIds: string[] });

export type WebhookHandlersMap = Record<string, WebhookHandler>;

export interface AirtableWebhookReference {
    base: {
        id: string;
    };
    webhook: {
        id: string;
    };
    timestamp: string;
}

export interface RouteWebhookResponse {
    response: string | Record<string, any> | null;
    statusCode: number;
    connectionIds?: string[];
    toForward?: unknown;
}
