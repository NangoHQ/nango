import { createRequire } from 'node:module';

import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { Feature, FlowsZeroJson, FunctionCapabilities, HTTP_METHOD } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const TEMPLATES_ZERO_PREFIX = 'templates-zero';

const nodeRequire = createRequire(import.meta.url);
let flowsJson: FlowsZeroJson | undefined;

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
    /** Compiled module `type`. Today's catalog files are action modules. */
    module: 'action';
}

export interface CatalogToolEndpoint {
    name: string;
    method: HTTP_METHOD;
    path: string;
}

const toolsByProvider = new Map<string, CatalogTool[]>();
const toolByProviderAndName = new Map<string, Map<string, CatalogTool>>();
const endpointsByProvider = new Map<string, CatalogToolEndpoint[]>();

function getFlowsJson(): FlowsZeroJson {
    flowsJson ??= nodeRequire('../../../flows.zero.json') as FlowsZeroJson;
    return flowsJson;
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

function jsPath(folder: string, name: string): string {
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/build/${folder}_actions_${name}.cjs`;
}

function tsPath(folder: string, name: string): string {
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/actions/${name}.ts`;
}

function loadCatalogTools(provider: string): CatalogTool[] {
    const cached = toolsByProvider.get(provider);
    if (cached) {
        return cached;
    }

    const integration = getFlowsJson().find((entry) => entry.providerConfigKey === provider);
    if (!integration) {
        toolsByProvider.set(provider, []);
        toolByProviderAndName.set(provider, new Map());
        endpointsByProvider.set(provider, []);
        return [];
    }

    const folder = integration.symLinkTargetName ?? provider;
    const endpoints: CatalogToolEndpoint[] = [];
    const tools: CatalogTool[] = integration.actions.map((item) => {
        if (item.endpoint) {
            endpoints.push({ name: item.name, method: item.endpoint.method, path: item.endpoint.path });
        }
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

    toolsByProvider.set(provider, tools);
    toolByProviderAndName.set(provider, new Map(tools.map((tool) => [tool.name, tool])));
    endpointsByProvider.set(provider, endpoints);
    return tools;
}

export function listCatalogTools(provider: string): CatalogTool[] {
    return loadCatalogTools(provider);
}

export function getCatalogTool(provider: string, name: string): CatalogTool | undefined {
    loadCatalogTools(provider);
    return toolByProviderAndName.get(provider)?.get(name);
}

export function listCatalogToolEndpoints(provider: string): CatalogToolEndpoint[] {
    loadCatalogTools(provider);
    return endpointsByProvider.get(provider) ?? [];
}

export function isTemplatesZeroPath(fileLocation: string): boolean {
    return fileLocation.startsWith(`${TEMPLATES_ZERO_PREFIX}/`);
}
