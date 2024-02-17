import type { Request, Response, NextFunction } from 'express';
import type { Span } from 'dd-trace';
import tracer from '../tracer.js';
import { routeWebhook, featureFlags, environmentService, telemetry, MetricTypes } from '@nangohq/shared';

class WebhookController {
    async receive(req: Request, res: Response, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('server.sync.receiveWebhook', {
            childOf: active as Span
        });

        const { environmentUuid, providerConfigKey } = req.params;
        const headers = req.headers;
        try {
            if (!environmentUuid || !providerConfigKey) {
                return;
            }
            const isGloballyEnabled = await featureFlags.isEnabled('external-webhooks', 'global', true, true);

            if (!isGloballyEnabled) {
                res.status(404).send();
                return;
            }

            const accountUUID = await environmentService.getAccountUUIDFromEnvironmentUUID(environmentUuid);

            if (!accountUUID) {
                res.status(404).send();
                return;
            }

            span.setTag('nango.accountUUID', accountUUID);
            span.setTag('nango.environmentUUID', environmentUuid);
            span.setTag('nango.providerConfigKey', providerConfigKey);

            const areWebhooksEnabled = await featureFlags.isEnabled('external-webhooks', accountUUID, true, true);

            let responsePayload = null;

            if (areWebhooksEnabled) {
                const startTime = Date.now();
                responsePayload = await routeWebhook(environmentUuid, providerConfigKey, headers, req.body, req.rawBody!);
                const endTime = Date.now();
                const totalRunTime = (endTime - startTime) / 1000;

                await telemetry.duration(MetricTypes.WEBHOOK_TRACK_RUNTIME, totalRunTime);
            } else {
                res.status(404).send();

                return;
            }

            if (!responsePayload) {
                res.status(200).send();
                return;
            } else {
                res.status(200).send(responsePayload);
                return;
            }
        } catch (err) {
            span.setTag('nango.error', err);

            next(err);
        } finally {
            span.finish();
        }
    }
}

export default new WebhookController();
