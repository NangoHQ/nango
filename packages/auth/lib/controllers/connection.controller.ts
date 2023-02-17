import type { Request, Response } from 'express';
import connectionService from '../services/connection.service.js';
import type { NextFunction } from 'express';
import configService from '../services/config.service.js';
import { ProviderConfig, ProviderTemplate, Connection, ProviderAuthModes } from '../models.js';
import analytics from '../utils/analytics.js';
import { getAccountIdFromLocals } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

class ConnectionController {
    templates: { [key: string]: ProviderTemplate } = configService.getTemplates();

    async getConnectionCreds(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccountIdFromLocals(res);
            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.res(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.res(res, 'missing_provider_config');
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

            if (connection == null) {
                errorManager.res(res, 'unkown_connection');
                return;
            }

            let config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, accountId);

            if (config == null) {
                errorManager.res(res, 'unknown_provider_config');
                return;
            }

            let template: ProviderTemplate | undefined = this.templates[config.provider];

            if (template == null) {
                throw Error('unknown_provider_template_in_config');
            }

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(connection, config, template, accountId);
            }

            analytics.track('server:connection_fetched', accountId, { provider: config.provider });

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(_: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccountIdFromLocals(res);
            let connections: Object[] = await connectionService.listConnections(accountId);

            analytics.track('server:connection_list_fetched', accountId);

            res.status(200).send({ connections: connections });
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
