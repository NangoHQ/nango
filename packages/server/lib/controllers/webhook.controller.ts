import type { Request, Response, NextFunction } from 'express';
import { routeWebhook } from '@nangohq/shared';

class WebhookController {
    async receive(req: Request, res: Response, next: NextFunction) {
        const { environmentUuid, providerConfigKey } = req.params;
        const headers = req.headers;
        try {
            if (!environmentUuid || !providerConfigKey) {
                return;
            }

            routeWebhook(environmentUuid, providerConfigKey, headers, req.body);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new WebhookController();
