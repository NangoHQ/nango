import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import {
    flowService,
    getConfigWithEndpointsByProviderConfigKey,
    StandardNangoConfig,
    AuthModes,
    errorManager,
    NangoError,
    getEnvironmentId,
    getEnvironmentAndAccountId,
    Template as ProviderTemplate,
    analytics,
    AnalyticsTypes,
    configService,
    environmentService,
    Config as ProviderConfig,
    IntegrationWithCreds,
    Integration as ProviderIntegration,
    connectionService,
    getUniqueSyncsByProviderConfig,
    getActionsByProviderConfigKey,
    getFlowConfigsByParams,
    Config,
    getGlobalWebhookReceiveUrl
} from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession, parseConnectionConfigParamsFromTemplate } from '../utils/utils.js';

interface Integration {
    authMode: AuthModes;
    uniqueKey: string;
    provider: string;
    connection_count: number;
    scripts: number;
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

            const integrations = await Promise.all(
                configs.map(async (config: ProviderConfig) => {
                    const template = configService.getTemplates()[config.provider];
                    const activeFlows = await getFlowConfigsByParams(environment.id, config.unique_key);

                    const integration: Integration = {
                        authMode: template?.auth_mode || AuthModes.App,
                        uniqueKey: config.unique_key,
                        provider: config.provider,
                        scripts: activeFlows?.length,
                        connection_count: connections.filter((connection) => connection.provider === config.unique_key).length,
                        creationDate: config.created_at
                    };

                    if (template && template.auth_mode !== AuthModes.App && template.auth_mode !== AuthModes.Custom) {
                        integration['connectionConfigParams'] = parseConnectionConfigParamsFromTemplate(template!);
                    }

                    return integration;
                })
            );

            res.status(200).send({
                integrations: integrations.sort((a: Integration, b: Integration) => {
                    const creationDateA = a.creationDate || new Date(0);
                    const creationDateB = b.creationDate || new Date(0);
                    return creationDateB.getTime() - creationDateA.getTime();
                })
            });
        } catch (err) {
            next(err);
        }
    }

    async listProvidersFromYaml(_: Request, res: Response, next: NextFunction) {
        try {
            const providers = Object.entries(configService.getTemplates())
                .map((providerProperties: [string, ProviderTemplate]) => {
                    const [provider, properties] = providerProperties;
                    return {
                        name: provider,
                        defaultScopes: properties.default_scopes,
                        authMode: properties.auth_mode,
                        categories: properties.categories,
                        docs: properties.docs
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(providers);
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

            const provider = req.body['provider'];

            const template = await configService.getTemplate(provider as string);
            const authMode = template.auth_mode;

            if (authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2 || authMode === AuthModes.Custom) {
                if (req.body['client_id'] == null) {
                    errorManager.errRes(res, 'missing_client_id');
                    return;
                }
                if (req.body['client_secret'] == null) {
                    errorManager.errRes(res, 'missing_client_secret');
                    return;
                }
            }

            let oauth_client_secret = req.body['client_secret'] ?? null;

            if (template.auth_mode === AuthModes.App) {
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom: Config['custom'] = req.body['custom'] ?? null;

            if (template.auth_mode === AuthModes.Custom) {
                if (!custom || !custom['private_key']) {
                    errorManager.errRes(res, 'missing_custom');
                    return;
                }

                const { private_key } = custom;

                if (!private_key.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                custom['private_key'] = Buffer.from(private_key).toString('base64');
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
            if (custom) {
                newConfig.custom = custom;
            }

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

    async editProviderConfigName(req: Request, res: Response, next: NextFunction) {
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

            if (req.body['oldProviderConfigKey'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            if (req.body['newProviderConfigKey'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const oldProviderConfigKey = req.body['oldProviderConfigKey'];
            const newProviderConfigKey = req.body['newProviderConfigKey'];

            const config = await configService.getProviderConfig(oldProviderConfigKey, environment.id);

            if (config == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            await configService.editProviderConfigName(oldProviderConfigKey, newProviderConfigKey, environment.id);
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
            const includeFlows = req.query['include_flows'] === 'true';

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);
            const environmentUuid = await environmentService.getAccountUUIDFromEnvironment(environmentId);

            if (config == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const providerTemplate = configService.getTemplate(config?.provider);
            const authMode = providerTemplate.auth_mode;

            let client_secret = config.oauth_client_secret;
            let webhook_secret = null;
            const custom = config.custom;

            if (authMode === AuthModes.App) {
                client_secret = Buffer.from(client_secret, 'base64').toString('ascii');
                const hash = `${config.oauth_client_id}${config.oauth_client_secret}${config.app_link}`;
                webhook_secret = crypto.createHash('sha256').update(hash).digest('hex');
            }

            if (authMode === AuthModes.Custom && custom) {
                const { private_key } = custom;
                custom['private_key'] = Buffer.from(custom['private_key'] as string, 'base64').toString('ascii');
                const hash = `${custom['app_id']}${private_key}${config.app_link}`;
                webhook_secret = crypto.createHash('sha256').update(hash).digest('hex');
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
            const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, providerConfigKey);
            const connection_count = connections.length;
            let webhookUrl: string | null = null;
            if (hasWebhook) {
                webhookUrl = `${getGlobalWebhookReceiveUrl()}/${environmentUuid}/${config.provider}`;
            }

            const configRes: ProviderIntegration | IntegrationWithCreds = includeCreds
                ? ({
                      unique_key: config.unique_key,
                      provider: config.provider,
                      client_id: config.oauth_client_id,
                      client_secret,
                      custom: config.custom,
                      scopes: config.oauth_scopes,
                      app_link: config.app_link,
                      auth_mode: authMode,
                      created_at: config.created_at as Date,
                      syncs,
                      actions,
                      has_webhook: Boolean(hasWebhook),
                      webhook_secret,
                      connections,
                      docs: providerTemplate.docs,
                      connection_count,
                      has_webhook_user_defined_secret: providerTemplate.webhook_user_defined_secret,
                      webhook_url: webhookUrl
                  } as IntegrationWithCreds)
                : ({ unique_key: config.unique_key, provider: config.provider, syncs, actions } as ProviderIntegration);

            if (includeFlows) {
                const availableFlows = flowService.getAllAvailableFlowsAsStandardConfig();
                const [availableFlowsForProvider] = availableFlows.filter((flow) => flow.providerConfigKey === config.provider);

                const enabledFlows = await getConfigWithEndpointsByProviderConfigKey(environmentId, providerConfigKey as string);
                const unEnabledFlows: StandardNangoConfig = availableFlowsForProvider as StandardNangoConfig;

                if (availableFlows && enabledFlows && unEnabledFlows) {
                    const { syncs: enabledSyncs, actions: enabledActions } = enabledFlows;

                    const { syncs, actions } = unEnabledFlows;

                    const filteredSyncs = syncs.filter((sync) => !enabledSyncs.some((enabledSync) => enabledSync.name === sync.name));
                    const filteredActions = actions.filter((action) => !enabledActions.some((enabledAction) => enabledAction.name === action.name));

                    unEnabledFlows.syncs = filteredSyncs;
                    unEnabledFlows.actions = filteredActions;
                }

                const flows = { unEnabledFlows, enabledFlows };
                res.status(200).send({ config: configRes, flows });

                return;
            }

            res.status(200).send({ config: configRes });
        } catch (err) {
            next(err);
        }
    }

    async getConnections(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const providerConfigKey = req.params['providerConfigKey'] as string;
            const { environmentId } = response;

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, providerConfigKey);

            res.status(200).send(connections);
        } catch (err) {
            next(err);
        }
    }

    async createEmptyProviderConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { accountId, environmentId } = response;

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }

            const provider = req.body['provider'];

            if (!configService.checkProviderTemplateExists(provider)) {
                errorManager.errRes(res, 'unknown_provider_template');
                return;
            }

            const result = await configService.createEmptyProviderConfig(provider, environmentId);

            if (result) {
                analytics.track(AnalyticsTypes.CONFIG_CREATED, accountId, { provider });
                res.status(200).send({
                    config: {
                        unique_key: result.unique_key,
                        provider
                    }
                });
            } else {
                throw new NangoError('provider_config_creation_failure');
            }
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

            if ((authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2 || authMode === AuthModes.Custom) && req.body['oauth_client_id'] == null) {
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
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom: ProviderConfig['custom'] = req.body['custom'];

            if (authMode === AuthModes.Custom) {
                if (!custom || !custom['private_key']) {
                    errorManager.errRes(res, 'missing_custom');
                    return;
                }

                const { private_key } = custom;

                if (!private_key.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                custom['private_key'] = Buffer.from(private_key).toString('base64');
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
            if (custom) {
                config.custom = custom;
            }

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
            const authMode = template.auth_mode;

            if (authMode === AuthModes.ApiKey || authMode === AuthModes.Basic) {
                errorManager.errRes(res, 'provider_config_edit_not_allowed');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }

            if (authMode === AuthModes.OAuth1 || authMode === AuthModes.OAuth2 || authMode === AuthModes.Custom) {
                if (req.body['oauth_client_id'] == null) {
                    errorManager.errRes(res, 'missing_client_id');
                    return;
                }
                if (req.body['oauth_client_secret'] == null) {
                    errorManager.errRes(res, 'missing_client_secret');
                    return;
                }
            }

            let oauth_client_secret = req.body['oauth_client_secret'] ?? null;

            if (template.auth_mode === AuthModes.App) {
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom = req.body['custom'] ?? null;

            if (template.auth_mode === AuthModes.Custom) {
                const { private_key } = custom;

                if (!private_key.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                custom.private_key = Buffer.from(private_key).toString('base64');
            }

            const newConfig: ProviderConfig = {
                unique_key: req.body['provider_config_key'],
                provider: req.body['provider'],
                oauth_client_id: req.body['oauth_client_id'],
                oauth_client_secret,
                oauth_scopes: req.body['oauth_scopes'],
                app_link: req.body['app_link'],
                environment_id: environmentId,
                custom
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
