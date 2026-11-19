import { filterJsonSchemaForModels } from '@nangohq/utils';

import { catalogStore } from './store.js';

import type { Feature, FlowZeroJson, FunctionCapabilities } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const TEMPLATES_ZERO_PREFIX = 'templates-zero';

export interface CatalogTool {
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
    /** Compiled JavaScript under `templates-zero/`. */
    fileLocation: string;
    /** TypeScript source under `templates-zero/`. */
    sourceLocation: string;
    capabilities: FunctionCapabilities;
    /** Compiled module `type`. Catalog files are action modules. */
    module: 'action';
}

interface CatalogTools {
    list: CatalogTool[];
    byName: Map<string, CatalogTool>;
}

const noTools: CatalogTools = { list: [], byName: new Map() };

// Keyed by the catalog entry, so the tools go away together with it when the catalog store evicts it.
const toolsByEntry = new WeakMap<FlowZeroJson, CatalogTools>();

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

function jsPath(folder: string, name: string): string {
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/build/${folder}_actions_${name}.cjs`;
}

function tsPath(folder: string, name: string): string {
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/actions/${name}.ts`;
}

function loadCatalogTools(provider: string): CatalogTools {
    const integration = catalogStore.getEntry(provider);
    if (!integration) {
        return noTools;
    }
    const cached = toolsByEntry.get(integration);
    if (cached) {
        return cached;
    }

    const folder = integration.symLinkTargetName ?? provider;
    const list: CatalogTool[] = integration.actions.map((item) => {
        return {
            name: item.name,
            description: item.description,
            input: item.input,
            output: item.output ?? [],
            scopes: item.scopes,
            jsonSchema: resolveJsonSchema({ itemSchema: item.json_schema, integrationSchema: integration.jsonSchema, usedModels: item.usedModels }),
            version: item.version,
            sdkVersion: `${integration.sdkVersion}-zero`,
            fileLocation: jsPath(folder, item.name),
            sourceLocation: tsPath(folder, item.name),
            capabilities: toCapabilities(item.features ?? []),
            module: 'action'
        };
    });

    const tools: CatalogTools = { list, byName: new Map(list.map((tool) => [tool.name, tool])) };
    toolsByEntry.set(integration, tools);
    return tools;
}

export function listCatalogTools(provider: string): CatalogTool[] {
    return loadCatalogTools(provider).list;
}

export function getCatalogTool(provider: string, name: string): CatalogTool | undefined {
    return loadCatalogTools(provider).byName.get(name);
}

export function isTemplatesZeroPath(fileLocation: string): boolean {
    return fileLocation.startsWith(`${TEMPLATES_ZERO_PREFIX}/`);
}
