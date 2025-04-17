import type { InternalNango } from './internal-nango.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, string>,
    body: T,
    rawBody: string,
    logContextGetter: LogContextGetter
) => Promise<WebhookResponse>;

export type WebhookResponse =
    | {
          acknowledgementResponse?: unknown;
          parsedBody?: unknown;
          connectionIds?: string[] | undefined;
          statusCode?: number;
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
