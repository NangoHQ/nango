import { createRequire } from 'node:module';

import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { Feature, FlowsZeroJson, NangoSyncEndpointV2 } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const TEMPLATES_ZERO_PREFIX = 'templates-zero';

const nodeRequire = createRequire(import.meta.url);
let flowsJson: FlowsZeroJson | undefined;

export interface CatalogAction {
    name: string;
    description: string;
    scopes: string[];
    input: string | null;
    output: string[];
    endpoint: NangoSyncEndpointV2 | null;
    json_schema: JSONSchema7 | null;
    sdk_version: string;
    features: Feature[];
    version: string;
}

const actionsByProvider = new Map<string, CatalogAction[]>();
const actionByProviderAndName = new Map<string, Map<string, CatalogAction>>();
const templatesZeroFolderByProvider = new Map<string, string>();

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

function loadProvider(provider: string): CatalogAction[] {
    const cached = actionsByProvider.get(provider);
    if (cached) {
        return cached;
    }

    const integration = getFlowsJson().find((entry) => entry.providerConfigKey === provider);
    if (!integration) {
        actionsByProvider.set(provider, []);
        actionByProviderAndName.set(provider, new Map());
        templatesZeroFolderByProvider.set(provider, provider);
        return [];
    }

    templatesZeroFolderByProvider.set(provider, integration.symLinkTargetName ?? provider);

    const actions: CatalogAction[] = integration.actions.map((item) => ({
        name: item.name,
        description: item.description,
        scopes: item.scopes,
        input: item.input,
        output: item.output ?? [],
        endpoint: item.endpoint,
        json_schema: resolveJsonSchema({ itemSchema: item.json_schema, integrationSchema: integration.jsonSchema, usedModels: item.usedModels }),
        sdk_version: `${integration.sdkVersion}-zero`,
        features: item.features ?? [],
        version: item.version
    }));

    const byName = new Map(actions.map((action) => [action.name, action]));
    actionsByProvider.set(provider, actions);
    actionByProviderAndName.set(provider, byName);
    return actions;
}

export function listCatalogActions(provider: string): CatalogAction[] {
    return loadProvider(provider);
}

export function getCatalogAction(provider: string, name: string): CatalogAction | undefined {
    loadProvider(provider);
    return actionByProviderAndName.get(provider)?.get(name);
}

function templatesZeroFolder(provider: string): string {
    loadProvider(provider);
    return templatesZeroFolderByProvider.get(provider) ?? provider;
}

export function catalogActionJsPath({ provider, name }: { provider: string; name: string }): string {
    const folder = templatesZeroFolder(provider);
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/build/${folder}_actions_${name}.cjs`;
}

export function catalogActionTsPath({ provider, name }: { provider: string; name: string }): string {
    const folder = templatesZeroFolder(provider);
    return `${TEMPLATES_ZERO_PREFIX}/${folder}/actions/${name}.ts`;
}

export function isTemplatesZeroPath(fileLocation: string): boolean {
    return fileLocation.startsWith(`${TEMPLATES_ZERO_PREFIX}/`);
}
