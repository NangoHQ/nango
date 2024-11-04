import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';
import { loadStandardConfig } from './nango-config.service.js';
import type { NangoConfig, NangoIntegration, NangoModelV1, StandardNangoConfig } from '../models/NangoConfig.js';
import { errorManager } from '../index.js';
import { stringifyError } from '@nangohq/utils';
import type { ScriptTypeLiteral } from '@nangohq/types';

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

            const { success, response } = loadStandardConfig(nangoConfig, false);

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

    public getFlowByIntegrationAndName({ provider, type, scriptName }: { provider: string; type: ScriptTypeLiteral; scriptName: string }) {
        const availablePublicFlows = this.getAllAvailableFlowsAsStandardConfig();
        const flows = availablePublicFlows.filter((flow) => flow.providerConfigKey === provider);
        if (flows.length <= 0 || !flows[0]) {
            return null;
        }

        const flow = flows[0][`${type}s`].find((flow) => flow.name === scriptName);
        return flow || null;
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
