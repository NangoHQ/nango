import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';
import { loadStandardConfig } from './nango-config.service.js';
import type { NangoConfig, NangoIntegration, NangoIntegrationData, NangoModelV1, StandardNangoConfig } from '../models/NangoConfig.js';

export interface Config {
    integrations: NangoIntegration & NangoModelV1;
}

class FlowService {
    public getAllAvailableFlows(): Config {
        try {
            const flowPath = path.join(dirname(), '../../../flows.yaml');
            const flows = yaml.load(fs.readFileSync(flowPath).toString());

            return flows as Config;
        } catch (_e) {
            return {} as Config;
        }
    }

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
                    standardConfig.push(...responseWithRaw);
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

    public async getAddedPublicFlows(environmentId: number) {
        return getPublicConfig(environmentId);
    }
}

export default new FlowService();
