import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { InternalNango } from './internal-nango.js';
import type { Result } from '@nangohq/utils';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, string>,
    body: T,
    rawBody: string,
    logContextGetter: LogContextGetter
) => Promise<Result<WebhookResponse>>;

export interface WebhookResponseOnly {
    content: string | Record<string, any> | null;
    statusCode: number;
}

export interface WebhookResponseWithConnectionIds extends WebhookResponseOnly {
    connectionIds: string[];
}

export interface WebhookResponseWithForward extends WebhookResponseWithConnectionIds {
    toForward: unknown;
}

export interface WebhookResponseNoContent {
    content: null;
    statusCode: 204;
}

export type WebhookResponse = WebhookResponseOnly | WebhookResponseWithConnectionIds | WebhookResponseWithForward | WebhookResponseNoContent;

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
