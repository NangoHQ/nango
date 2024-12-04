import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';
import type { StandardNangoConfig } from '../models/NangoConfig.js';
import type { SyncType } from '../index.js';
import { errorManager } from '../index.js';
import { stringifyError } from '@nangohq/utils';
import type { FlowsYaml, ScriptTypeLiteral } from '@nangohq/types';
import { NangoYamlParserV2 } from '@nangohq/nango-yaml';

class FlowService {
    flowsRaw: FlowsYaml | undefined;
    flowsStandard: StandardNangoConfig[] | undefined;

    public getAllAvailableFlows(): FlowsYaml {
        if (this.flowsRaw) {
            return this.flowsRaw;
        }

        try {
            const flowPath = path.join(dirname(import.meta.url), '../../flows.yaml');
            this.flowsRaw = yaml.load(fs.readFileSync(flowPath).toString()) as FlowsYaml;

            if (this.flowsRaw === undefined || !('integrations' in this.flowsRaw) || Object.keys(this.flowsRaw.integrations).length <= 0) {
                throw new Error('empty_flows');
            }

            return this.flowsRaw;
        } catch (err) {
            errorManager.report(`failed_to_find_flows, ${stringifyError(err)}`);
            return {} as FlowsYaml;
        }
    }

    public getAllAvailableFlowsAsStandardConfig(): StandardNangoConfig[] {
        if (this.flowsStandard) {
            return this.flowsStandard;
        }

        const config = this.getAllAvailableFlows();
        const { integrations: allIntegrations } = config;

        const standardConfig: StandardNangoConfig[] = [];

        for (const providerConfigKey in allIntegrations) {
            const flow = allIntegrations[providerConfigKey];
            if (!flow) {
                continue;
            }

            const { models, ...rest } = flow;
            const parser = new NangoYamlParserV2({
                raw: { integrations: { [providerConfigKey]: rest }, models: models },
                yaml: ''
            });
            parser.parse(); // we assume it's valid because it's coming from a pre-validated CI
            const parsed = parser.parsed!;
            const integration = parsed.integrations.find((value) => value.providerConfigKey === providerConfigKey)!;

            const std: StandardNangoConfig = {
                providerConfigKey,
                actions: [],
                syncs: [],
                [`on-events`]: []
            };

            for (const item of [...integration.actions, ...integration.syncs]) {
                if (item.type === 'action') {
                    std.actions.push({
                        name: item.name,
                        type: item.type,
                        returns: item.output || [],
                        description: item.description,
                        runs: '',
                        scopes: item.scopes,
                        version: item.version || null,
                        is_public: true,
                        pre_built: true,
                        endpoints: item.endpoint ? [item.endpoint] : [],
                        input: item.input ? (parsed.models.get(item.input) as any) : undefined,
                        enabled: false,
                        models: item.usedModels.map((name) => parsed.models.get(name)!) as any,
                        last_deployed: null,
                        webhookSubscriptions: [],
                        json_schema: null,
                        metadata: { description: item.description, scopes: item.scopes }
                    });
                } else {
                    std.syncs.push({
                        name: item.name,
                        type: item.type,
                        returns: item.output || [],
                        description: item.description,
                        track_deletes: item.track_deletes,
                        auto_start: item.auto_start,
                        sync_type: item.sync_type as SyncType,
                        attributes: {},
                        scopes: item.scopes,
                        version: item.version || null,
                        is_public: true,
                        pre_built: true,
                        endpoints: item.endpoints,
                        input: item.input ? (parsed.models.get(item.input) as any) : undefined,
                        runs: item.runs,
                        enabled: false,
                        models: item.usedModels.map((name) => parsed.models.get(name)!) as any,
                        last_deployed: null,
                        webhookSubscriptions: [],
                        json_schema: null,
                        metadata: { description: item.description, scopes: item.scopes }
                    });
                }
            }

            standardConfig.push(std);
        }

        this.flowsStandard = standardConfig;

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
