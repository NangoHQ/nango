import { filterJsonSchemaForModels } from '@nangohq/utils';

import { generateCatalogFunctionUuid, isCatalogFunctionUuid } from './uuid.js';

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
    type: 'action';
}

export type CatalogFunctionDefinition = CatalogFunctionManifestEntry & {
    uuid: string;
    source: 'catalog';
    provider: string;
    sdkVersion: string;
};

export type CatalogEntry = CatalogAction | CatalogFunctionDefinition;

type ProviderCatalog = {
    entries: CatalogEntry[];
    actions: CatalogAction[];
    byName: Map<string, CatalogEntry>;
    byUuid: Map<string, CatalogFunctionDefinition>;
};

export class CatalogReader {
    private readonly providers = new Map<string, ProviderCatalog>();
    private providersByUuid: Map<string, string> | undefined;

    constructor(private readonly loadManifest: () => FlowsZeroJson) {}

    public listEntries(provider: string): CatalogEntry[] {
        return this.load(provider).entries;
    }

    public getEntry(provider: string, name: string): CatalogEntry | undefined {
        return this.load(provider).byName.get(name);
    }

    public getFunctionByUuid(uuid: string): CatalogFunctionDefinition | undefined {
        const normalized = uuid.toLowerCase();
        if (!isCatalogFunctionUuid(normalized)) {
            return undefined;
        }
        const provider = this.indexFunctionUuids().get(normalized);
        return provider === undefined ? undefined : this.load(provider).byUuid.get(normalized);
    }

    private indexFunctionUuids(): Map<string, string> {
        if (this.providersByUuid) {
            return this.providersByUuid;
        }
        const providersByUuid = new Map<string, string>();
        for (const integration of this.loadManifest()) {
            if (!integration.functions?.length) {
                continue;
            }
            for (const entry of integration.functions) {
                const uuid = resolveFunctionUuid(integration.providerConfigKey, entry);
                if (providersByUuid.has(uuid)) {
                    throw new Error(`Duplicate catalog function UUID '${uuid}' across the catalog`);
                }
                providersByUuid.set(uuid, integration.providerConfigKey);
            }
        }
        this.providersByUuid = providersByUuid;
        return providersByUuid;
    }

    public listActions(provider: string): CatalogAction[] {
        return this.load(provider).actions;
    }

    public getAction(provider: string, name: string): CatalogAction | undefined {
        const entry = this.getEntry(provider, name);
        return entry?.type === 'action' ? entry : undefined;
    }

    private load(provider: string): ProviderCatalog {
        const cached = this.providers.get(provider);
        if (cached) {
            return cached;
        }

        const integration = this.loadManifest().find((entry) => entry.providerConfigKey === provider);
        const folder = integration?.symLinkTargetName ?? provider;
        const actions = integration ? loadActions(integration, folder) : [];
        const functions: CatalogFunctionDefinition[] = integration
            ? (integration.functions ?? []).map((item) => ({
                  ...item,
                  uuid: resolveFunctionUuid(provider, item),
                  source: 'catalog',
                  provider,
                  sdkVersion: integration.sdkVersion
              }))
            : [];
        const entries: CatalogEntry[] = [...actions, ...functions];
        const byName = new Map<string, CatalogEntry>();
        for (const entry of entries) {
            if (byName.has(entry.name)) {
                throw new Error(`Duplicate catalog function name '${entry.name}' for provider '${provider}'`);
            }
            byName.set(entry.name, entry);
        }

        const byUuid = new Map<string, CatalogFunctionDefinition>();
        for (const entry of functions) {
            if (byUuid.has(entry.uuid)) {
                throw new Error(`Duplicate catalog function UUID '${entry.uuid}' for provider '${provider}'`);
            }
            byUuid.set(entry.uuid, entry);
        }

        const catalog = { entries, actions, byName, byUuid };
        this.providers.set(provider, catalog);
        return catalog;
    }
}

function resolveFunctionUuid(provider: string, entry: CatalogFunctionManifestEntry): string {
    if (entry.uuid === undefined) {
        return generateCatalogFunctionUuid({ provider, name: entry.name });
    }
    if (!isCatalogFunctionUuid(entry.uuid)) {
        throw new Error(`Invalid catalog function UUID for '${entry.name}' in provider '${provider}'`);
    }
    return entry.uuid;
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
        type: 'action'
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
