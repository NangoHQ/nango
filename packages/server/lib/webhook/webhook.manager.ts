import tracer from 'dd-trace';

import db from '@nangohq/database';
import { connectionService, customerKeyService, externalWebhookService, getProvider, makeDataTransferEvent, NangoError, pubsub } from '@nangohq/shared';
import { Err, getLogger } from '@nangohq/utils';
import { forwardWebhook } from '@nangohq/webhooks';

import { capping } from '../utils/usage.js';
import * as webhookHandlers from './index.js';
import { InternalNango } from './internal-nango.js';

import type { WebhookHandlersMap, WebhookResponse } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { MaybeStampedEvent } from '@nangohq/pubsub';
import type { Config } from '@nangohq/shared';
import type { ConnectionConfig, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.Manager');

const handlers: WebhookHandlersMap = webhookHandlers as unknown as WebhookHandlersMap;

export async function routeWebhook({
    environment,
    account,
    integration,
    headers,
    plan,
    body,
    rawBody,
    query,
    logContextGetter
}: {
    environment: DBEnvironment;
    account: DBTeam;
    integration: Config;
    plan?: DBPlan | undefined;
    headers: Record<string, any>;
    body: any;
    rawBody: string;
    query?: Record<string, string>;
    logContextGetter: LogContextGetter;
}): Promise<WebhookResponse> {
    // Check if both body and headers are empty
    const hasBody = body && (typeof body === 'object' ? Object.keys(body).length > 0 : true);
    const hasHeaders = headers && Object.keys(headers).length > 0;

    if (!hasBody && !hasHeaders) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const provider = getProvider(integration.provider);
    if (!provider || !provider['webhook_routing_script']) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const webhookRoutingScript = provider['webhook_routing_script'];
    const handler = handlers[webhookRoutingScript];
    if (!handler) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const internalNango = new InternalNango({
        team: account,
        environment,
        plan,
        integration,
        logContextGetter
    });

    const result: Result<WebhookResponse> = await tracer.trace(`webhook.route.${integration.provider}`, async () => {
        try {
            const handlerResult = await handler(internalNango, headers, body, rawBody, query);
            return handlerResult;
        } catch (err) {
            logger.error(`error processing incoming webhook for ${integration.unique_key} - `, err);
            return Err(err instanceof Error ? err : new Error(String(err)));
        }
    });

    if (result.isErr()) {
        const err = result.error;
        if (err instanceof NangoError) {
            return {
                content: { error: err.message },
                statusCode: err.status
            };
        }
        return {
            content: { error: 'internal_error' },
            statusCode: 500
        };
    }

    const res = result.value;

    // Only forward webhook if there is no capping and the response was successful
    const cappingStatus = await capping.getStatus(plan || null, 'webhook_forwards');
    if (!cappingStatus.isCapped && res.statusCode === 200 && ((plan && plan.has_webhooks_forward) || !plan)) {
        const webhookBodyToForward = 'toForward' in res ? res.toForward : body;
        const connectionIds = 'connectionIds' in res ? res.connectionIds : [];

        // Forward the webhook to the customer asynchronously to avoid provider timeouts.
        // Some providers stop sending webhooks if Nango doesn't respond quickly due to slow customer endpoints.
        // All forward-related DB work (settings, signing key, per-connection config) runs inside this
        // fire-and-forget block, off the provider response path, so a large connection fan-out can't delay
        // the response back to the provider.
        const forwardSpan = tracer.startSpan('webhook.forward');
        const pendingEvents: MaybeStampedEvent<'usage'>[] = [];

        void (async () => {
            const webhookSettings = await externalWebhookService.get(environment.id);

            const webhookSigningSecret = webhookSettings
                ? await customerKeyService.getWebhookSigningKeyForEnv(db.knex, environment.id).then((r) => {
                      if (r.isErr()) throw r.error;
                      return r.value;
                  })
                : '';

            // Fetch the matched connections' config so forwardWebhook can honor a per-connection webhook URL override.
            const connectionConfigByConnectionId = webhookSettings
                ? await connectionService.getConnectionConfigByConnectionIds({
                      connectionIds,
                      provider_config_key: integration.unique_key,
                      environment_id: environment.id
                  })
                : new Map<string, ConnectionConfig>();

            return forwardWebhook({
                integration,
                account,
                environment,
                secret: webhookSigningSecret,
                webhookSettings,
                connectionIds,
                connectionConfigByConnectionId,
                payload: webhookBodyToForward,
                webhookOriginalHeaders: headers,
                logContextGetter,
                onBytes: (bytes, connectionId) => {
                    pendingEvents.push(
                        makeDataTransferEvent({
                            pkg: 'server',
                            callsite: 'webhook_forward',
                            accountId: account.id,
                            connectionId,
                            integrationId: integration.unique_key,
                            environmentId: environment.id,
                            meteredBytes: bytes,
                            environmentName: environment.name
                        })
                    );
                }
            });
        })()
            .then((forwardResult) => {
                if (forwardResult?.isOk()) {
                    for (const { connectionId, success } of forwardResult.value.results) {
                        pendingEvents.push({
                            subject: 'usage',
                            type: 'usage.webhook_forward',
                            payload: {
                                value: 1,
                                properties: {
                                    accountId: account.id,
                                    environmentId: environment.id,
                                    environmentName: environment.name,
                                    integrationId: integration.unique_key,
                                    connectionId,
                                    success
                                }
                            }
                        });
                    }
                }
            })
            .catch((err: unknown) => {
                logger.error(`error forwarding webhook for ${integration.unique_key} - `, err);
            })
            .finally(() => {
                if (pendingEvents.length > 0) {
                    void pubsub.publisher.publishBatch({ subject: 'usage', events: pendingEvents });
                }

                forwardSpan.finish();
            });
    }

    return res;
}
