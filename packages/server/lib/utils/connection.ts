import type { Request, Response } from 'express';

import errorManager from '../utils/error.manager.js';
import { ProviderConfig, ProviderTemplate, Connection, ProviderAuthModes, ProviderTemplateOAuth2 } from '../models.js';
import connectionService from '../services/connection.service.js';
import configService from '../services/config.service.js';
import analytics from './analytics.js';
import { getAccount } from './utils.js';

export const getConnectionCredentials = async (req: Request, res: Response) => {
    const accountId = getAccount(res);
    const connectionId = req.params['connectionId'] as string;
    const providerConfigKey = req.query['provider_config_key'] as string;
    const instantRefresh = req.query['force_refresh'] === 'true';

    if (connectionId === null) {
        errorManager.errRes(res, 'missing_connection');
        return;
    }

    if (providerConfigKey === null) {
        errorManager.errRes(res, 'missing_provider_config');
        return;
    }

    const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

    if (connection === null) {
        errorManager.errRes(res, 'unkown_connection');
        return;
    }

    const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, accountId);

    if (config === null) {
        errorManager.errRes(res, 'unknown_provider_config');
        return;
    }

    const template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

    if (connection.credentials.type === ProviderAuthModes.OAuth2) {
        connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
            connection,
            config,
            template as ProviderTemplateOAuth2,
            instantRefresh
        );
    }

    analytics.track('server:connection_fetched', accountId, { provider: config.provider });

    return connection;
};
