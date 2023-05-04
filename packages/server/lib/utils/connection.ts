import type { Response } from 'express';

import errorManager from '../utils/error.manager.js';
import { ProviderConfig, ProviderTemplate, Connection, ProviderAuthModes, ProviderTemplateOAuth2 } from '../models.js';
import connectionService from '../services/connection.service.js';
import configService from '../services/config.service.js';
import analytics from './analytics.js';
import { getAccount } from './utils.js';
import { updateAppLogsAndWrite, LogData } from './file-logger.js';

export const getConnectionCredentials = async (res: Response, connectionId: string, providerConfigKey: string, log: LogData, instantRefresh = false) => {
    const accountId = getAccount(res);

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
        updateAppLogsAndWrite(log, 'error', {
            content: `Connection not found using connectionId: ${connectionId} and providerConfigKey: ${providerConfigKey}`,
            connectionId,
            providerConfigKey,
            timestamp: Date.now()
        });

        errorManager.errRes(res, 'unkown_connection');
        throw new Error(`Connection not found`);
    }

    const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, accountId);

    if (config === null) {
        updateAppLogsAndWrite(log, 'error', {
            content: `Configuration not found using the providerConfigKey: ${providerConfigKey} and the account id: ${accountId}}`,
            connectionId,
            providerConfigKey,
            timestamp: Date.now()
        });

        errorManager.errRes(res, 'unknown_provider_config');
        throw new Error(`Provider config not found`);
    }

    const template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

    if (connection.credentials.type === ProviderAuthModes.OAuth2) {
        connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
            connection,
            config,
            template as ProviderTemplateOAuth2,
            log,
            instantRefresh,
            log.action
        );
    }

    analytics.track('server:connection_fetched', accountId, { provider: config.provider });

    return connection;
};
