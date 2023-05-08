import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import configService from '../../services/config.service.js';
import { LogData, LogLevel, LogAction, updateAppLogs, updateAppLogsAndWrite } from '../../utils/file-logger.js';
import errorManager from '../../utils/error.manager.js';
import type { Connection, HTTP_VERB } from '../../models.js';
import { getConnectionCredentials } from '../../utils/connection.js';

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

            const log = {
                level: 'debug' as LogLevel,
                success: true,
                action: 'unified' as LogAction,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                method: req.method as HTTP_VERB,
                connectionId,
                providerConfigKey,
                messages: [] as LogData['messages'],
                message: '',
                endpoint: ''
            };

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                updateAppLogsAndWrite(log, 'error', {
                    timestamp: Date.now(),
                    content: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
                });
                return;
            }

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');

                updateAppLogsAndWrite(log, 'error', {
                    timestamp: Date.now(),
                    content: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
                });
                return;
            }

            updateAppLogs(log, 'debug', {
                timestamp: Date.now(),
                content: `Connection id: '${connectionId}' and provider config key: '${providerConfigKey}' parsed and received successfully`
            });

            const connection = await getConnectionCredentials(res, connectionId, providerConfigKey, log);

            updateAppLogs(log, 'debug', {
                timestamp: Date.now(),
                content: 'Connection credentials found successfully'
            });

            const { account_id: accountId } = connection as Connection;
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
                    updateAppLogsAndWrite(log, 'error', {
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
