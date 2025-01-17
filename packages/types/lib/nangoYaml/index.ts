import type { OnEventType } from '../scripts/on-events/api';

export type HTTP_METHOD = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type SyncTypeLiteral = 'incremental' | 'full' | 'FULL' | 'INCREMENTAL'; // TODO: There has been some mixed type in the DB, fix casing
export type ScriptFileType = 'actions' | 'syncs' | 'on-events' | 'post-connection-scripts'; // post-connection-scripts is deprecated
export type ScriptTypeLiteral = 'action' | 'sync' | 'on-event';

// --------------
// YAML V1
// --------------
export interface NangoYamlV1 {
    integrations: Record<string, Record<string, NangoYamlV1Integration>>;
    models: NangoYamlModel;
}
export interface NangoYamlV1Integration {
    type?: ScriptTypeLiteral;
    returns?: string | string[];
    description?: string;
    runs?: string;
    track_deletes?: boolean;
    auto_start?: boolean;
    version?: string;
}

// --------------
// YAML V2
// --------------
export interface NangoYamlV2 {
    integrations: Record<string, NangoYamlV2Integration>;
    models: NangoYamlModel;
}
export interface NangoYamlV2Endpoint {
    method?: HTTP_METHOD;
    path: string;
    group?: string | undefined;
}
export interface NangoYamlV2Integration {
    provider?: string;
    syncs?: Record<string, NangoYamlV2IntegrationSync>;
    actions?: Record<string, NangoYamlV2IntegrationAction>;
    'on-events'?: Record<string, string[]>;
    /**
     * @deprecated
     */
    'post-connection-scripts'?: string[];
}
export interface NangoYamlV2IntegrationSync {
    endpoint: string | string[] | NangoYamlV2Endpoint | NangoYamlV2Endpoint[];
    output: string | string[];
    description?: string;
    sync_type?: SyncTypeLiteral;
    track_deletes?: boolean;
    auto_start?: boolean;
    runs: string;
    scopes?: string | string[];
    input?: string;
    'webhook-subscriptions'?: string | string[];
    version?: string;
}
export interface NangoYamlV2IntegrationAction {
    endpoint: string | NangoYamlV2Endpoint;
    output?: string | string[];
    description?: string;
    scopes?: string | string[];
    input?: string;
    version?: string;
}

// ---- Model
// Eslint disabled because it's the only way to make circular ref works
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface NangoYamlModel {
    [key: string]: NangoYamlModelFields;
}

export interface NangoYamlModelFields {
    [key: string]: NangoYamlModelField;
}
export type NangoYamlModelField = boolean | number | string | null | string[] | NangoYamlModelFields;

// Mixed
export type NangoYaml = NangoYamlV1 | NangoYamlV2;

// -------------- Parsed
export interface NangoYamlParsed {
    yamlVersion: 'v1' | 'v2';
    integrations: NangoYamlParsedIntegration[];
    models: Map<string, NangoModel>;
}
export interface NangoYamlParsedIntegration {
    providerConfigKey: string;
    syncs: ParsedNangoSync[];
    actions: ParsedNangoAction[];
    onEventScripts: Record<OnEventType, string[]>;
    /**
     * @deprecated
     */
    postConnectionScripts?: string[];
}
export interface ParsedNangoSync {
    name: string;
    type: 'sync';
    endpoints: NangoSyncEndpointV2[];
    description: string;
    sync_type: SyncTypeLiteral;
    track_deletes: boolean;
    auto_start: boolean;
    runs: string;
    scopes: string[];
    input: string | null;
    output: string[] | null;
    usedModels: string[];
    webhookSubscriptions: string[];
    version: string;
}

export interface ParsedNangoAction {
    name: string;
    type: 'action';
    description: string;
    input: string | null;
    output: string[] | null;
    endpoint: NangoSyncEndpointV2 | null;
    scopes: string[];
    usedModels: string[];
    version: string;
}

export type LayoutMode = 'root' | 'nested';

export interface NangoModel {
    name: string;
    fields: NangoModelField[];
    isAnon?: boolean | undefined;
}
export interface NangoModelField {
    name: string;
    value: string | number | boolean | null | NangoModelField[];
    dynamic?: boolean | undefined;
    tsType?: boolean | undefined;
    model?: boolean | undefined;
    array?: boolean | undefined;
    union?: boolean | undefined;
    optional?: boolean | undefined;
}

export type NangoSyncEndpointOld = Partial<Record<HTTP_METHOD, string | undefined>>;

export interface NangoSyncEndpointV2 {
    method: HTTP_METHOD;
    path: string;
    group?: string | undefined;
}

// --- Providers Yaml is a modified nango.yaml
export interface FlowsYaml {
    integrations: Record<string, NangoYamlV2Integration & { models: NangoYamlModel }>;
}
