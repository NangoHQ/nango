import { filterJsonSchemaForModels } from '@nangohq/utils';

import flowsJson from '../../flows.zero.json' with { type: 'json' };

import type { FlowsZeroJson, ScriptTypeLiteral, StandardNangoConfig } from '@nangohq/types';

class FlowService {
    flowsJson: FlowsZeroJson = flowsJson as FlowsZeroJson;
    flowsStandard: StandardNangoConfig[] | undefined;

    public getAllAvailableFlowsAsStandardConfig(): StandardNangoConfig[] {
        if (this.flowsStandard) {
            return this.flowsStandard;
        }

        const standardConfig: StandardNangoConfig[] = [];

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
}

export default new FlowService();
