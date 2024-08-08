import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';
import { loadStandardConfig } from './nango-config.service.js';
import remoteFileService from './file/remote.service.js';
import type { NangoConfig, NangoIntegration, NangoSyncConfig, NangoModelV1, StandardNangoConfig } from '../models/NangoConfig.js';
import type { HTTP_VERB } from '../models/Generic.js';
import { errorManager } from '../index.js';
import { stringifyError } from '@nangohq/utils';

export interface Config {
    integrations: NangoIntegration & NangoModelV1;
}

class FlowService {
    // TODO: cache this
    public getAllAvailableFlows(): Config {
        try {
            const flowPath = path.join(dirname(import.meta.url), '../../flows.yaml');
            const flows = yaml.load(fs.readFileSync(flowPath).toString()) as Config;

            if (flows === undefined || !('integrations' in flows) || Object.keys(flows.integrations).length <= 0) {
                throw new Error('empty_flows');
            }

            return flows;
        } catch (err) {
            errorManager.report(`failed_to_find_flows, ${stringifyError(err)}`);
            return {} as Config;
        }
    }

    // TODO: cache this
    public getAllAvailableFlowsAsStandardConfig(): StandardNangoConfig[] {
        const config = this.getAllAvailableFlows();
        const { integrations: allIntegrations } = config;

        const standardConfig: StandardNangoConfig[] = [];

        for (const providerConfigKey in allIntegrations) {
            const integrations = allIntegrations[providerConfigKey] as NangoIntegration & NangoModelV1;
            const { models, rawName, ...flow } = integrations;
            const nangoConfig: NangoConfig = {
                integrations: {
                    [providerConfigKey]: flow
                },
                models: models as NangoModelV1
            };

            const { success, response } = loadStandardConfig(nangoConfig, false, true);

            if (success && response) {
                if (rawName) {
                    const responseWithRaw = response.map((standardConfigItem) => {
                        return { ...standardConfigItem, rawName };
                    });
                    standardConfig.push(...(responseWithRaw as unknown as StandardNangoConfig[]));
                } else {
                    standardConfig.push(...response);
                }
            }
        }

        return standardConfig;
    }

    public getFlow(name: string) {
        const integrations = this.getAllAvailableFlowsAsStandardConfig();

        for (const integration of integrations) {
            for (const syncs of integration.syncs) {
                if (syncs.name === name) {
                    return syncs;
                }
            }

            for (const actions of integration.actions) {
                if (actions.name === name) {
                    return actions;
                }
            }
        }

        return null;
    }

    public getSingleFlowAsStandardConfig(name: string): StandardNangoConfig | null {
        const integrations = this.getAllAvailableFlowsAsStandardConfig();

        let standardConfig: StandardNangoConfig = {} as StandardNangoConfig;

        for (const integration of integrations) {
            for (const syncs of integration.syncs) {
                if (syncs.name === name) {
                    standardConfig = integration;
                    standardConfig.syncs = [syncs];
                    standardConfig.actions = [];
                    return standardConfig;
                }
            }

            for (const actions of integration.actions) {
                if (actions.name === name) {
                    standardConfig = integration;
                    standardConfig.actions = [actions];
                    standardConfig.syncs = [];
                    return standardConfig;
                }
            }
        }

        return null;
    }

    public getActionAsNangoConfig(provider: string, name: string): NangoConfig | null {
        const integrations = this.getAllAvailableFlowsAsStandardConfig();

        let foundAction: NangoSyncConfig | null = null;
        let foundProvider = '';

        for (const integration of integrations) {
            if (integration.providerConfigKey === provider) {
                foundProvider = integration.rawName || provider;
                for (const action of integration.actions) {
                    if (action.name === name) {
                        foundAction = action;
                    }
                }
            }
        }

        if (!foundAction) {
            return null;
        }

        const nangoConfig = {
            integrations: {
                [foundProvider]: {
                    [foundAction.name]: {
                        sync_config_id: foundAction.id,
                        runs: '',
                        type: foundAction.type,
                        returns: foundAction.returns,
                        input: foundAction.input,
                        track_deletes: false,
                        auto_start: false,
                        attributes: foundAction.attributes,
                        fileLocation: remoteFileService.getRemoteFileLocationForPublicTemplate(foundProvider, foundAction.name),
                        version: '1',
                        pre_built: true,
                        is_public: true,
                        metadata: {
                            description: foundAction.description,
                            scopes: foundAction.scopes
                        }
                    }
                }
            },
            models: {}
        } as NangoConfig;

        return nangoConfig;
    }

    public getPublicActionByPathAndMethod(provider: string, path: string, method: string): string | null {
        let foundAction = null;
        const integrations = this.getAllAvailableFlowsAsStandardConfig();

        for (const integration of integrations) {
            if (integration.providerConfigKey === provider) {
                for (const action of integration.actions) {
                    const endpoints = Array.isArray(action.endpoints) ? action.endpoints : [action.endpoints];
                    for (const endpoint of endpoints) {
                        if (endpoint[method as HTTP_VERB] && endpoint[method as HTTP_VERB] === path) {
                            foundAction = action.name;
                        }
                    }
                }
            }
        }

        return foundAction;
    }

    public async getAddedPublicFlows(environmentId: number) {
        return getPublicConfig(environmentId);
    }
}

export default new FlowService();
