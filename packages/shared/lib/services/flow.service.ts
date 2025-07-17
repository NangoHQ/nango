import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';

import { NangoYamlParserV2, nangoModelsToJsonSchema } from '@nangohq/nango-yaml';
import { filterJsonSchemaForModels, report, stringifyError } from '@nangohq/utils';

import flowsJson from '../../flows.zero.json' with { type: 'json' };

import type { FlowsYaml, FlowsZeroJson, ScriptTypeLiteral, StandardNangoConfig } from '@nangohq/types';

class FlowService {
    flowsJson: FlowsZeroJson = flowsJson as FlowsZeroJson;
    flowsRaw: FlowsYaml | undefined;
    flowsStandard: StandardNangoConfig[] | undefined;

    public getFlowsYaml(): FlowsYaml {
        if (this.flowsRaw) {
            return this.flowsRaw;
        }

        try {
            const flowPath = path.join(import.meta.dirname, '../../flows.yaml');
            this.flowsRaw = yaml.load(fs.readFileSync(flowPath).toString()) as FlowsYaml;

            if (this.flowsRaw === undefined || !('integrations' in this.flowsRaw) || Object.keys(this.flowsRaw.integrations).length <= 0) {
                throw new Error('empty_flows');
            }

            return this.flowsRaw;
        } catch (err) {
            report('failed_to_find_flows', { error: stringifyError(err) });
            throw err;
        }
    }

    public getAllAvailableFlowsAsStandardConfig(): StandardNangoConfig[] {
        if (this.flowsStandard) {
            return this.flowsStandard;
        }

        const config = this.getFlowsYaml();
        const { integrations: allIntegrations } = config;

        const standardConfig: StandardNangoConfig[] = [];

        // Legacy Yaml
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
                const models = item.usedModels.map((model) => parsed.models.get(model)!);
                const jsonSchema = models.length > 0 ? nangoModelsToJsonSchema(models) : null;

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
                        input: item.input || undefined,
                        enabled: false,
                        last_deployed: null,
                        webhookSubscriptions: [],
                        json_schema: jsonSchema,
                        metadata: { description: item.description, scopes: item.scopes },
                        sdk_version: null,
                        is_zero_yaml: false
                    });
                } else {
                    std.syncs.push({
                        name: item.name,
                        type: item.type,
                        returns: item.output || [],
                        description: item.description,
                        track_deletes: item.track_deletes,
                        auto_start: item.auto_start,
                        sync_type: item.sync_type,
                        attributes: {},
                        scopes: item.scopes,
                        version: item.version || null,
                        is_public: true,
                        pre_built: true,
                        endpoints: item.endpoints,
                        input: item.input || undefined,
                        runs: item.runs,
                        enabled: false,
                        last_deployed: null,
                        webhookSubscriptions: [],
                        json_schema: jsonSchema,
                        metadata: { description: item.description, scopes: item.scopes },
                        sdk_version: null,
                        is_zero_yaml: false
                    });
                }
            }

            standardConfig.push(std);
        }

        this.flowsStandard = standardConfig;

        // Zero Yaml
        for (const integration of this.flowsJson) {
            const std: StandardNangoConfig = {
                providerConfigKey: integration.providerConfigKey,
                actions: [],
                syncs: [],
                [`on-events`]: []
            };

            for (const item of integration.syncs) {
                const jsonSchema = filterJsonSchemaForModels(integration.jsonSchema, item.usedModels);
                if (jsonSchema.isErr()) {
                    throw new Error(`failed_to_filter_json_schema`, { cause: jsonSchema.error });
                }

                std.syncs.push({
                    name: item.name,
                    type: item.type,
                    returns: item.output || [],
                    description: item.description,
                    track_deletes: item.track_deletes,
                    auto_start: item.auto_start,
                    sync_type: item.sync_type,
                    attributes: {},
                    scopes: item.scopes,
                    version: item.version || null,
                    is_public: true,
                    pre_built: true,
                    endpoints: item.endpoints,
                    input: item.input || undefined,
                    runs: item.runs,
                    enabled: false,
                    last_deployed: null,
                    webhookSubscriptions: [],
                    json_schema: jsonSchema.value,
                    metadata: { description: item.description, scopes: item.scopes },
                    sdk_version: `${integration.sdkVersion}-zero`,
                    is_zero_yaml: true
                });
            }
            for (const item of integration.actions) {
                const jsonSchema = filterJsonSchemaForModels(integration.jsonSchema, item.usedModels);
                if (jsonSchema.isErr()) {
                    throw new Error(`failed_to_filter_json_schema`, { cause: jsonSchema.error });
                }

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
                    input: item.input || undefined,
                    enabled: false,
                    last_deployed: null,
                    webhookSubscriptions: [],
                    json_schema: jsonSchema.value,
                    metadata: { description: item.description, scopes: item.scopes },
                    sdk_version: `${integration.sdkVersion}-zero`,
                    is_zero_yaml: true
                });
            }

            // Replace the flow if it already exists
            // During migration we will keep both yaml and zero available but we don't want to have duplicates
            const pos = this.flowsStandard.findIndex((flow) => flow.providerConfigKey === integration.providerConfigKey);
            if (pos !== -1) {
                this.flowsStandard[pos] = std;
            } else {
                this.flowsStandard.push(std);
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
}

export default new FlowService();
