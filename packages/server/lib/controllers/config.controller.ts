import type { NextFunction, Request, Response } from 'express';
import {
    AuthModes,
    errorManager,
    NangoError,
    getEnvironmentId,
    getEnvironmentAndAccountId,
    analytics,
    AnalyticsTypes,
    configService,
    Config as ProviderConfig,
    IntegrationWithCreds,
    Integration as ProviderIntegration,
    connectionService,
    getUniqueSyncsByProviderConfig,
    getActionsByProviderConfigKey
} from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession, parseConnectionConfigParamsFromTemplate } from '../utils/utils.js';

interface Integration {
    authMode: AuthModes;
    uniqueKey: string;
    provider: string;
    connectionCount: number;
    creationDate: Date | undefined;
    connectionConfigParams?: string[];
}

class ConfigController {
    /**
     * Webapp
     */

    async listProviderConfigsWeb(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { environment } = response;

            const configs = await configService.listProviderConfigs(environment.id);

            const connections = await connectionService.listConnections(environment.id);

            const integrations = configs.map((config: ProviderConfig) => {
                const template = configService.getTemplates()[config.provider];
                const integration: Integration = {
                    authMode: template?.auth_mode as AuthModes,
                    uniqueKey: config.unique_key,
                    provider: config.provider,
                    connectionCount: connections.filter((connection) => connection.provider === config.unique_key).length,
                    creationDate: config.created_at
                };
                if (template && template.auth_mode !== AuthModes.App) {
                    integration['connectionConfigParams'] = parseConnectionConfigParamsFromTemplate(template!);
                }
                return integration;
            });

            res.status(200).send({
                integrations: integrations.sort(function (a: Integration, b: Integration) {
                    return b.creationDate!.getTime() - a.creationDate!.getTime();
                })
            });
        } catch (err) {
            next(err);
        }
    }

    async editProviderConfigWeb(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { environment } = response;

            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }
            if (req.body['client_id'] == null) {
                errorManager.errRes(res, 'missing_client_id');
                return;
            }
            if (req.body['client_secret'] == null) {
                errorManager.errRes(res, 'missing_client_secret');
                return;
            }

            const provider = req.body['provider'];

            const template = await configService.getTemplate(provider as string);

            let oauth_client_secret = req.body['client_secret'] ?? null;

            if (template.auth_mode === AuthModes.App) {
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const newConfig: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['client_id'],
                oauth_client_secret,
                oauth_scopes: req.body['scopes'],
                app_link: req.body['app_link'],
                environment_id: environment.id
            };

            const oldConfig = await configService.getProviderConfig(newConfig.unique_key, environment.id);

            if (oldConfig == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            await configService.editProviderConfig(newConfig);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    /**
     * CLI
     */

    async listProviderConfigs(_: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const configs = await configService.listProviderConfigs(environmentId);
            const results = configs.map((c: ProviderConfig) => ({ unique_key: c.unique_key, provider: c.provider }));
            res.status(200).send({ configs: results });
        } catch (err) {
            next(err);
        }
    }

    async getProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { environmentId } = response;

            const providerConfigKey = req.params['providerConfigKey'] as string;
            const includeCreds = req.query['include_creds'] === 'true';

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const providerTemplate = configService.getTemplate(config?.provider);
            const authMode = providerTemplate.auth_mode;

            let client_secret = config.oauth_client_secret;

            if (authMode === AuthModes.App) {
                client_secret = Buffer.from(client_secret, 'base64').toString('ascii');
            }

            const syncConfigs = await getUniqueSyncsByProviderConfig(environmentId, providerConfigKey);
            const syncs = syncConfigs.map((sync) => {
                const { metadata, ...config } = sync;
                return {
                    ...config,
                    description: metadata?.description
                };
            });
            const actions = await getActionsByProviderConfigKey(environmentId, providerConfigKey);
            const hasWebhook = providerTemplate.webhook_routing_script;

            const configRes: ProviderIntegration | IntegrationWithCreds = includeCreds
                ? ({
                      unique_key: config.unique_key,
                      provider: config.provider,
                      client_id: config.oauth_client_id,
                      client_secret,
                      scopes: config.oauth_scopes,
                      app_link: config.app_link,
                      auth_mode: authMode,
                      syncs,
                      actions,
                      has_webhook: Boolean(hasWebhook)
                  } as IntegrationWithCreds)
                : ({ unique_key: config.unique_key, provider: config.provider, syncs, actions } as ProviderIntegration);

            res.status(200).send({ config: configRes });
        } catch (err) {
            next(err);
        }
    }

    async createProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { accountId, environmentId } = response;

            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }

            const provider = req.body['provider'];

            if (!configService.checkProviderTemplateExists(provider)) {
                errorManager.errRes(res, 'unknown_provider_template');
                return;
            }

            const providerTemplate = configService.getTemplate(provider);
            const authMode = providerTemplate.auth_mode;

            if ((authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2) && req.body['oauth_client_id'] == null) {
                errorManager.errRes(res, 'missing_client_id');
                return;
            }

            if (authMode === AuthModes.App && req.body['oauth_client_id'] == null) {
                errorManager.errRes(res, 'missing_app_id');
                return;
            }

            if ((authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2) && req.body['oauth_client_secret'] == null) {
                errorManager.errRes(res, 'missing_client_secret');
                return;
            }

            if (authMode === AuthModes.App && req.body['oauth_client_secret'] == null) {
                errorManager.errRes(res, 'missing_app_secret');
                return;
            }

            const uniqueConfigKey = req.body['provider_config_key'];

            if ((await configService.getProviderConfig(uniqueConfigKey, environmentId)) != null) {
                errorManager.errRes(res, 'duplicate_provider_config');
                return;
            }

            let oauth_client_secret = req.body['oauth_client_secret'] ?? null;

            if (authMode === AuthModes.App) {
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const oauth_client_id = req.body['oauth_client_id'] ?? null;
            const oauth_scopes = req.body['oauth_scopes'] ?? '';
            const app_link = req.body['app_link'] ?? null;

            if (oauth_scopes && Array.isArray(oauth_scopes)) {
                errorManager.errRes(res, 'invalid_oauth_scopes');
                return;
            }

            const config: ProviderConfig = {
                unique_key: uniqueConfigKey,
                provider: provider,
                oauth_client_id,
                oauth_client_secret,
                oauth_scopes: oauth_scopes
                    ? oauth_scopes
                          .replace(/ /g, ',')
                          .split(',')
                          .filter((w: string) => w)
                          .join(',')
                    : '',
                app_link,
                environment_id: environmentId
            };

            const result = await configService.createProviderConfig(config);

            if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
                analytics.track(AnalyticsTypes.CONFIG_CREATED, accountId, { provider: config.provider });
                res.status(200).send({
                    config: {
                        unique_key: config.unique_key,
                        provider: config.provider
                    }
                });
            } else {
                throw new NangoError('provider_config_creation_failure');
            }
        } catch (err) {
            next(err);
        }
    }

    async editProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const provider = req.body['provider'];

            const template = await configService.getTemplate(provider as string);

            if (template.auth_mode === AuthModes.ApiKey || template.auth_mode === AuthModes.Basic) {
                errorManager.errRes(res, 'provider_config_edit_not_allowed');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }
            if (req.body['oauth_client_id'] == null) {
                errorManager.errRes(res, 'missing_client_id');
                return;
            }
            if (req.body['oauth_client_secret'] == null) {
                errorManager.errRes(res, 'missing_client_secret');
                return;
            }

            let oauth_client_secret = req.body['oauth_client_secret'] ?? null;

            if (template.auth_mode === AuthModes.App) {
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const newConfig: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret,
                oauth_scopes: req.body['oauth_scopes'],
                app_link: req.body['app_link'],
                environment_id: environmentId
            };

            const oldConfig = await configService.getProviderConfig(newConfig.unique_key, environmentId);

            if (oldConfig == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            await configService.editProviderConfig(newConfig);
            res.status(200).send({
                config: {
                    unique_key: newConfig.unique_key,
                    provider: newConfig.provider
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async deleteProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { environmentId } = response;
            const providerConfigKey = req.params['providerConfigKey'] as string;

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            await configService.deleteProviderConfig(providerConfigKey, environmentId);

            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new ConfigController();
