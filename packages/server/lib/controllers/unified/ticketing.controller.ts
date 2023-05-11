import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import { configService, createActivityLog, createActivityLogMessageAndEnd, createActivityLogMessage, LogLevel, LogAction, HTTP_VERB } from '@nangohq/shared';
import { getAccount } from '../../utils/utils.js';
import errorManager from '../../utils/error.manager.js';

class TicketingController {
    /**
     * Route
     * @desc
     *
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     */
    public async route(req: Request, res: Response, next: NextFunction) {
        try {
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;
            const accountId = getAccount(res);

            const log = {
                level: 'debug' as LogLevel,
                success: true,
                action: 'sync' as LogAction,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                method: req.method as HTTP_VERB,
                connection_id: connectionId as string,
                provider_config_key: providerConfigKey as string,
                account_id: accountId
            };

            const activityLogId = await createActivityLog(log);

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
                });
                return;
            }

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
                });
                return;
            }

            await createActivityLogMessage({
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Connection id: '${connectionId}' and provider config key: '${providerConfigKey}' parsed and received successfully`
            });

            await createActivityLogMessage({
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: 'Connection credentials found successfully'
            });

            const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);
            const providerName = String(providerConfig?.provider);

            let unifiedModel = null;
            switch (providerName) {
                case 'github':
                    // TODO lookup
                    unifiedModel = null;
                    break;
                case 'asana':
                    break;
                default:
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `The provider ${providerName} is not yet integrated for the unified API. Please reach out in the community to request it!`
                    });
                    break;
            }

            // send data back from the cache
            res.send({ provider: providerName, response: unifiedModel });
        } catch (error) {
            next(error);
        }
    }
}

export default new TicketingController();
