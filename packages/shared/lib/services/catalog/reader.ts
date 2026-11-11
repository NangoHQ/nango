import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { CatalogFunctionManifestEntry, Feature, FlowsZeroJson, FlowZeroJson, FunctionCapabilities } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const TEMPLATES_ZERO_PREFIX = 'templates-zero';

export interface CatalogAction {
    name: string;
    description: string;
    /** Model name. The legacy function list stores this in `input`. */
    input: string | null;
    /** Model names. The legacy function list stores these in `returns`. */
    output: string[];
    scopes: string[];
    jsonSchema: JSONSchema7 | null;
    version: string;
    /** The action runner requires a `-zero` sdk version to load these modules. */
    sdkVersion: string;
    /** Compiled JavaScript under templates-zero/. */
    fileLocation: string;
    /** TypeScript source under templates-zero/. */
    sourceLocation: string;
    capabilities: FunctionCapabilities;
    module: 'action';
}

export type CatalogFunctionDefinition = Omit<CatalogFunctionManifestEntry, 'fileLocation' | 'sourceLocation'> & {
    provider: string;
    /** Compiled JavaScript under templates-zero/. */
    fileLocation: string;
    /** TypeScript source under templates-zero/. */
    sourceLocation: string;
};

export type CatalogEntry = CatalogAction | CatalogFunctionDefinition;

type ProviderCatalog = {
    entries: CatalogEntry[];
    actions: CatalogAction[];
    byName: Map<string, CatalogEntry>;
};

export class CatalogReader {
    private readonly providers = new Map<string, ProviderCatalog>();

    constructor(private readonly loadManifest: () => FlowsZeroJson) {}

    public listEntries(provider: string): CatalogEntry[] {
        return this.load(provider).entries;
    }

    public getEntry(provider: string, name: string): CatalogEntry | undefined {
        return this.load(provider).byName.get(name);
    }

    public listActions(provider: string): CatalogAction[] {
        return this.load(provider).actions;
    }

    public getAction(provider: string, name: string): CatalogAction | undefined {
        const entry = this.getEntry(provider, name);
        return entry?.module === 'action' ? entry : undefined;
    }

    private load(provider: string): ProviderCatalog {
        const cached = this.providers.get(provider);
        if (cached) {
            return cached;
        }

        const integration = this.loadManifest().find((entry) => entry.providerConfigKey === provider);
        const folder = integration?.symLinkTargetName ?? provider;
        const actions = integration ? loadActions(integration, folder) : [];
        const functions: CatalogFunctionDefinition[] = (integration?.functions ?? []).map((item) => ({
            ...item,
            provider,
            fileLocation: `${TEMPLATES_ZERO_PREFIX}/${folder}/${item.fileLocation}`,
            sourceLocation: `${TEMPLATES_ZERO_PREFIX}/${folder}/${item.sourceLocation}`
        }));
        const entries: CatalogEntry[] = [...actions, ...functions];
        const byName = new Map<string, CatalogEntry>();
        for (const entry of entries) {
            if (byName.has(entry.name)) {
                throw new Error(`Duplicate catalog function name '${entry.name}' for provider '${provider}'`);
            }
            byName.set(entry.name, entry);
        }

        const catalog = { entries, actions, byName };
        this.providers.set(provider, catalog);
        return catalog;
    }
}

function loadActions(integration: FlowZeroJson, folder: string): CatalogAction[] {
    return integration.actions.map((item) => ({
        name: item.name,
        description: item.description,
        input: item.input,
        output: item.output ?? [],
        scopes: item.scopes,
        jsonSchema: resolveJsonSchema({ itemSchema: item.json_schema, integrationSchema: integration.jsonSchema, usedModels: item.usedModels }),
        version: item.version,
        sdkVersion: `${integration.sdkVersion}-zero`,
        fileLocation: `${TEMPLATES_ZERO_PREFIX}/${folder}/build/${folder}_actions_${item.name}.cjs`,
        sourceLocation: `${TEMPLATES_ZERO_PREFIX}/${folder}/actions/${item.name}.ts`,
        capabilities: toCapabilities(item.features ?? []),
        module: 'action'
    }));
}

function resolveJsonSchema({
    itemSchema,
    integrationSchema,
    usedModels
}: {
    itemSchema: JSONSchema7 | undefined;
    integrationSchema: JSONSchema7 | undefined;
    usedModels: string[];
}): JSONSchema7 | null {
    if (itemSchema) {
        return itemSchema;
    }
    if (!integrationSchema) {
        return null;
    }
    const filtered = filterJsonSchemaForModels(integrationSchema, usedModels);
    if (filtered.isErr()) {
        throw new Error('failed_to_filter_json_schema', { cause: filtered.error });
    }
    return filtered.value;
}

function toCapabilities(features: Feature[]): FunctionCapabilities {
    return {
        usesRecords: false,
        usesOutbound: false,
        usesCheckpoints: features.includes('checkpoints'),
        usesMetadata: false,
        usesInvoke: false
    };
}
