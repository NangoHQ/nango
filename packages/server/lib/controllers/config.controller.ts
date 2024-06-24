import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import type {
    StandardNangoConfig,
    Config as ProviderConfig,
    IntegrationWithCreds,
    Integration as ProviderIntegration,
    Config,
    NangoSyncConfig
} from '@nangohq/shared';
import { isHosted } from '@nangohq/utils';
import type { Template as ProviderTemplate, AuthModeType } from '@nangohq/types';
import {
    flowService,
    errorManager,
    NangoError,
    analytics,
    AnalyticsTypes,
    configService,
    connectionService,
    getUniqueSyncsByProviderConfig,
    getActionsByProviderConfigKey,
    getFlowConfigsByParams,
    getGlobalWebhookReceiveUrl,
    getSyncConfigsAsStandardConfig
} from '@nangohq/shared';
import { getOrchestrator, parseConnectionConfigParamsFromTemplate } from '../utils/utils.js';
import type { RequestLocals } from '../utils/express.js';

export interface Integration {
    authMode: AuthModeType;
    uniqueKey: string;
    provider: string;
    connection_count: number;
    scripts: number;
    creationDate: Date | undefined;
    connectionConfigParams?: string[];
}

export interface ListIntegration {
    integrations: Integration[];
}

interface FlowConfigs {
    enabledFlows: NangoSyncConfig[];
    disabledFlows: NangoSyncConfig[];
}

const orchestrator = getOrchestrator();

const separateFlows = (flows: NangoSyncConfig[]): FlowConfigs => {
    return flows.reduce(
        (acc: FlowConfigs, flow) => {
            const key = flow.enabled ? 'enabledFlows' : 'disabledFlows';
            acc[key].push(flow);
            return acc;
        },
        { enabledFlows: [], disabledFlows: [] }
    );
};

const getEnabledAndDisabledFlows = (publicFlows: StandardNangoConfig, allFlows: StandardNangoConfig) => {
    const { syncs: publicSyncs, actions: publicActions } = publicFlows;
    const { syncs, actions } = allFlows;

    const { enabledFlows: enabledSyncs, disabledFlows: disabledSyncs } = separateFlows(syncs);
    const { enabledFlows: enabledActions, disabledFlows: disabledActions } = separateFlows(actions);

    const filterFlows = (publicFlows: NangoSyncConfig[], enabled: NangoSyncConfig[], disabled: NangoSyncConfig[]) => {
        // We don't want to show public flows in a few different scenarios
        // 1. If a public flow is active (can be enabled or disabled) then it will show in allFlows so we filter it out
        // 2. If an active flow has the same endpoint as a public flow, we filter it out
        // 3. If an active flow has the same model name as a public flow, we filter it out
        return publicFlows.filter(
            (publicFlow) =>
                !enabled.concat(disabled).some((flow) => {
                    const flowModelNames = flow.models.map((model) => model.name);
                    const publicModelNames = publicFlow.models.map((model) => model.name);
                    const flowEndpointPaths = flow.endpoints.map((endpoint) => `${Object.keys(endpoint)[0]} ${Object.values(endpoint)[0]}`);
                    const publicEndpointPaths = publicFlow.endpoints.map((endpoint) => `${Object.keys(endpoint)[0]} ${Object.values(endpoint)[0]}`);
                    return (
                        flow.name === publicFlow.name ||
                        flowEndpointPaths.some((endpoint) => publicEndpointPaths.includes(endpoint)) ||
                        flowModelNames.some((model) => publicModelNames.includes(model))
                    );
                })
        );
    };

    const filteredSyncs = filterFlows(publicSyncs, enabledSyncs, disabledSyncs);
    const filteredActions = filterFlows(publicActions, enabledActions, disabledActions);

    const disabledFlows = { syncs: filteredSyncs.concat(disabledSyncs), actions: filteredActions.concat(disabledActions) };
    const flows = { syncs: enabledSyncs, actions: enabledActions };

    return { disabledFlows, flows };
};

class ConfigController {
    /**
     * Webapp
     */

    async listProviderConfigsWeb(_: Request, res: Response<ListIntegration, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

            const configs = await configService.listProviderConfigs(environment.id);

            const connections = await connectionService.listConnections(environment.id);

            const integrations = await Promise.all(
                configs.map(async (config: ProviderConfig) => {
                    const template = configService.getTemplates()[config.provider];
                    const activeFlows = await getFlowConfigsByParams(environment.id, config.unique_key);

                    const integration: Integration = {
                        authMode: template?.auth_mode || 'APP',
                        uniqueKey: config.unique_key,
                        provider: config.provider,
                        scripts: activeFlows.length,
                        connection_count: connections.filter((connection) => connection.provider === config.unique_key).length,
                        creationDate: config.created_at
                    };

                    if (template && template.auth_mode !== 'APP' && template.auth_mode !== 'CUSTOM') {
                        integration['connectionConfigParams'] = parseConnectionConfigParamsFromTemplate(template);
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

    listProvidersFromYaml(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
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

    async editProviderConfigWeb(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

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

            const template = configService.getTemplate(provider as string);
            const authMode = template.auth_mode;

            if (authMode === 'OAUTH1' || authMode === 'OAUTH2' || authMode === 'CUSTOM') {
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

            if (template.auth_mode === 'APP') {
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom: Config['custom'] = req.body['custom'] ?? null;

            if (template.auth_mode === 'CUSTOM') {
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

    async editProviderConfigName(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

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

    async listProviderConfigs(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const configs = await configService.listProviderConfigs(environmentId);
            const results = configs.map((c: ProviderConfig) => ({ unique_key: c.unique_key, provider: c.provider }));
            res.status(200).send({ configs: results });
        } catch (err) {
            next(err);
        }
    }

    async getProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const environmentId = environment.id;
            const providerConfigKey = req.params['providerConfigKey'] as string | null;
            const includeCreds = req.query['include_creds'] === 'true';
            const includeFlows = req.query['include_flows'] === 'true';

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (!config) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const providerTemplate = configService.getTemplate(config.provider);
            const authMode = providerTemplate.auth_mode;

            let client_secret = config.oauth_client_secret;
            let webhook_secret = null;
            const custom = config.custom;

            if (authMode === 'APP' && client_secret) {
                client_secret = Buffer.from(client_secret, 'base64').toString('ascii');
                const hash = `${config.oauth_client_id}${config.oauth_client_secret}${config.app_link}`;
                webhook_secret = crypto.createHash('sha256').update(hash).digest('hex');
            }

            if (authMode === 'CUSTOM' && custom) {
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
                webhookUrl = `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${config.provider}`;
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

            if (includeFlows && !isHosted) {
                const availablePublicFlows = flowService.getAllAvailableFlowsAsStandardConfig();
                const [publicFlows] = availablePublicFlows.filter((flow) => flow.providerConfigKey === config.provider);
                const allFlows = await getSyncConfigsAsStandardConfig(environmentId, providerConfigKey);

                if (availablePublicFlows.length && publicFlows && allFlows) {
                    const { disabledFlows, flows } = getEnabledAndDisabledFlows(publicFlows, allFlows);
                    res.status(200).send({ config: configRes, flows: { disabledFlows, allFlows: flows } });
                    return;
                }
                res.status(200).send({ config: configRes, flows: { allFlows, disabledFlows: publicFlows } });
                return;
            }

            res.status(200).send({ config: configRes });
        } catch (err) {
            next(err);
        }
    }

    async getConnections(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const providerConfigKey = req.params['providerConfigKey'] as string | null;
            const environmentId = res.locals['environment'].id;

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

    async createEmptyProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const accountId = res.locals['account'].id;

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

            void analytics.track(AnalyticsTypes.CONFIG_CREATED, accountId, { provider });
            res.status(200).send({
                config: {
                    unique_key: result.unique_key,
                    provider
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async createProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const accountId = res.locals['account'].id;

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

            if ((authMode === 'OAUTH1' || authMode === 'OAUTH2' || authMode === 'CUSTOM') && req.body['oauth_client_id'] == null) {
                errorManager.errRes(res, 'missing_client_id');
                return;
            }

            if (authMode === 'APP' && req.body['oauth_client_id'] == null) {
                errorManager.errRes(res, 'missing_app_id');
                return;
            }

            if ((authMode === 'OAUTH1' || authMode === 'OAUTH2') && req.body['oauth_client_secret'] == null) {
                errorManager.errRes(res, 'missing_client_secret');
                return;
            }

            if (authMode === 'APP' && req.body['oauth_client_secret'] == null) {
                errorManager.errRes(res, 'missing_app_secret');
                return;
            }

            const uniqueConfigKey = req.body['provider_config_key'];

            if ((await configService.getProviderConfig(uniqueConfigKey, environmentId)) != null) {
                errorManager.errRes(res, 'duplicate_provider_config');
                return;
            }

            let oauth_client_secret = req.body['oauth_client_secret'] ?? null;

            if (authMode === 'APP') {
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom: ProviderConfig['custom'] = req.body['custom'];

            if (authMode === 'CUSTOM') {
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
                void analytics.track(AnalyticsTypes.CONFIG_CREATED, accountId, { provider: config.provider });
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

    async editProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['provider_config_key'] == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const provider = req.body['provider'];

            const template = configService.getTemplate(provider as string);
            const authMode = template.auth_mode;

            if (authMode === 'API_KEY' || authMode === 'BASIC') {
                errorManager.errRes(res, 'provider_config_edit_not_allowed');
                return;
            }

            if (req.body['provider'] == null) {
                errorManager.errRes(res, 'missing_provider_template');
                return;
            }

            if (authMode === 'OAUTH1' || authMode === 'OAUTH2' || authMode === 'CUSTOM') {
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

            if (template.auth_mode === 'APP') {
                if (!oauth_client_secret.includes('BEGIN RSA PRIVATE KEY')) {
                    errorManager.errRes(res, 'invalid_app_secret');
                    return;
                }
                oauth_client_secret = Buffer.from(oauth_client_secret).toString('base64');
            }

            const custom = req.body['custom'] ?? null;

            if (template.auth_mode === 'CUSTOM') {
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

    async deleteProviderConfig(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const providerConfigKey = req.params['providerConfigKey'] as string | null;

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            await configService.deleteProviderConfig(providerConfigKey, environmentId, orchestrator);

            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new ConfigController();
