import { catalogStore } from '@nangohq/shared';
import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { FlowZeroJson, ScriptTypeLiteral, StandardNangoConfig } from '@nangohq/types';

/**
 * The template catalog's syncs and actions as standard config, one provider at a time.
 * The catalog itself is read by `catalogStore` (`@nangohq/shared`).
 */
function toStandardConfig(integration: FlowZeroJson): StandardNangoConfig {
    const std: StandardNangoConfig = {
        providerConfigKey: integration.providerConfigKey,
        actions: [],
        syncs: [],
        [`on-events`]: []
    };

    for (const item of integration.syncs) {
        // Prioritize function-level json-schema. Temporary fallback to top-level json-schema for smooth migration
        let jsonSchema = item.json_schema || null;
        if (!jsonSchema && integration.jsonSchema) {
            const jsonSchemaResult = filterJsonSchemaForModels(integration.jsonSchema, item.usedModels);
            if (jsonSchemaResult.isErr()) {
                throw new Error(`failed_to_filter_json_schema`, { cause: jsonSchemaResult.error });
            }
            jsonSchema = jsonSchemaResult.value;
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
            source: 'catalog',
            endpoints: item.endpoints,
            input: item.input || undefined,
            runs: item.runs,
            enabled: false,
            last_deployed: null,
            webhookSubscriptions: [],
            json_schema: jsonSchema,
            metadata: { description: item.description, scopes: item.scopes },
            sdk_version: `${integration.sdkVersion}-zero`,
            features: item.features || []
        });
    }
    for (const item of integration.actions) {
        // Prioritize function-level json-schema. Temporary fallback to top-level json-schema for smooth migration
        let jsonSchema = item.json_schema || null;
        if (!jsonSchema && integration.jsonSchema) {
            const jsonSchemaResult = filterJsonSchemaForModels(integration.jsonSchema, item.usedModels);
            if (jsonSchemaResult.isErr()) {
                throw new Error(`failed_to_filter_json_schema`, { cause: jsonSchemaResult.error });
            }
            jsonSchema = jsonSchemaResult.value;
        }

        std.actions.push({
            name: item.name,
            type: item.type,
            returns: item.output || [],
            description: item.description,
            runs: '',
            scopes: item.scopes,
            version: item.version || null,
            source: 'catalog',
            endpoints: item.endpoint ? [item.endpoint] : [],
            input: item.input || undefined,
            enabled: false,
            last_deployed: null,
            webhookSubscriptions: [],
            json_schema: jsonSchema,
            metadata: { description: item.description, scopes: item.scopes },
            sdk_version: `${integration.sdkVersion}-zero`,
            features: item.features || []
        });
    }

    return std;
}

class FlowService {
    /** A provider's templates (syncs and actions) as standard config, or null when the catalog has none for it. */
    public getProviderTemplates(provider: string): StandardNangoConfig | null {
        const integration = catalogStore.getEntry(provider);
        return integration ? toStandardConfig(integration) : null;
    }

    public getSymLinkTargetName(provider: string): string | null {
        return catalogStore.getSymLinkTargetName(provider);
    }

    public getFlowByIntegrationAndName({ provider, type, scriptName }: { provider: string; type: ScriptTypeLiteral; scriptName: string }) {
        const templates = this.getProviderTemplates(provider);
        if (!templates) {
            return null;
        }

        const flow = templates[`${type}s`].find((flow) => flow.name === scriptName);
        return flow || null;
    }
}

export default new FlowService();
