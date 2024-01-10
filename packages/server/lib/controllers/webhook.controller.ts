import type { Request, Response, NextFunction } from 'express';
import { routeWebhook, featureFlags, environmentService } from '@nangohq/shared';

class WebhookController {
    async receive(req: Request, res: Response, next: NextFunction) {
        const { environmentUuid, providerConfigKey } = req.params;
        const headers = req.headers;
        try {
            if (!environmentUuid || !providerConfigKey) {
                return;
            }
            const isGloballyDisabled = await featureFlags.isEnabled('external-webhooks', 'global', true, true);

            if (!isGloballyDisabled) {
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
                responsePayload = await routeWebhook(environmentUuid, providerConfigKey, headers, req.body);
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
