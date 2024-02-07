import type { Request, Response, NextFunction } from 'express';
import { routeWebhook, featureFlags, environmentService, metricsManager, MetricTypes, LogActionEnum } from '@nangohq/shared';

class WebhookController {
    async receive(req: Request, res: Response, next: NextFunction) {
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

            const areWebhooksEnabled = await featureFlags.isEnabled('external-webhooks', accountUUID, true, true);

            let responsePayload = null;

            if (areWebhooksEnabled) {
                const startTime = Date.now();
                responsePayload = await routeWebhook(environmentUuid, providerConfigKey, headers, req.body, req.rawBody!);
                const endTime = Date.now();
                const totalRunTime = (endTime - startTime) / 1000;

                await metricsManager.captureMetric(
                    MetricTypes.WEBHOOK_TRACK_RUNTIME,
                    `${new Date().toISOString()}-${providerConfigKey}`,
                    `webhook-${providerConfigKey}`,
                    totalRunTime,
                    LogActionEnum.WEBHOOK,
                    [`account_uuid:${accountUUID}`, `environment_uuid:${environmentUuid}`, `providerConfigKey:${providerConfigKey}`]
                );
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
            next(err);
        }
    }
}

export default new WebhookController();
