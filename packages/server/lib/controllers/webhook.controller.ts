import type { Request, Response, NextFunction } from 'express';
import { routeWebhook } from '@nangohq/shared';
/*
import type { LogLevel } from '@nangohq/shared';
import {
    getAccount,
    getEnvironmentId,
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    connectionCreated as connectionCreatedHook,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
*/

class WebhookController {
    async receive(req: Request, res: Response, next: NextFunction) {
        console.log('webhook received!');
        const { environmentUuid, providerConfigKey } = req.params;
        const headers = req.headers;
        try {
            if (!environmentUuid || !providerConfigKey) {
                return;
            }

            await routeWebhook(environmentUuid, providerConfigKey, headers, req.body);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new WebhookController();
