import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { InternalNango } from './internal-nango.js';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, any>,
    body: T,
    rawBody: string,
    logContextGetter: LogContextGetter
) => Promise<WebhookResponse>;

export type WebhookResponse =
    | {
          acknowledgementResponse?: unknown;
          parsedBody?: unknown;
          connectionIds?: string[] | undefined;
      }
    | undefined;

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
