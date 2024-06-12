export type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type SyncTypeLiteral = 'incremental' | 'full';

// --------------
// YAML V1
// --------------
export interface NangoYamlV1 {
    integrations: Record<string, Record<string, NangoYamlV1Integration>>;
    models: NangoYamlModel;
}
export interface NangoYamlV1Integration {
    type?: 'action' | 'sync';
    returns?: string | string[];
    description?: string;
    runs?: string;
    track_deletes?: boolean;
    auto_start?: boolean;
}

// --------------
// YAML V2
// --------------
export interface NangoYamlV2 {
    integrations: Record<string, NangoYamlV2Integration>;
    models: NangoYamlModel;
}
export interface NangoYamlV2Integration {
    provider?: string;
    syncs?: Record<string, NangoYamlV2IntegrationSync>;
    actions?: Record<string, NangoYamlV2IntegrationAction>;
    'post-connection-scripts'?: string[];
}
export interface NangoYamlV2IntegrationSync {
    endpoint: string | string[];
    output: string | string[];
    description?: string;
    sync_type?: SyncTypeLiteral;
    track_deletes?: boolean;
    auto_start?: boolean;
    runs: string;
    scopes?: string | string[];
    input?: string;
    'webhook-subscriptions'?: string | string[];
}
export interface NangoYamlV2IntegrationAction {
    endpoint: string;
    output?: string | string[];
    description?: string;
    scopes?: string | string[];
    input?: string;
}

// ---- Model
// Eslint disabled because it's the only way to make circular ref works
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface NangoYamlModel {
    [key: string]: NangoYamlModelFields;
}
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
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
}
export interface NangoYamlParsedIntegration {
    providerConfigKey: string;
    syncs: ParsedNangoSync[];
    actions: ParsedNangoAction[];
    postConnectionScripts?: string[];
}
export interface ParsedNangoSync {
    name: string;
    type: 'sync';
    endpoints: NangoSyncEndpoint[];
    // output: string | string[];
    layout_mode: LayoutMode;
    description: string;
    sync_type: SyncTypeLiteral;
    track_deletes: boolean;
    auto_start: boolean;
    runs: string;
    scopes: string[];
    input: NangoModel | NangoModelField | null;
    // returns: NangoModel[];
    models: NangoModel[];
    webhookSubscriptions: string[];
    nango_yaml_version: 'v1' | 'v2';

    // attributes?: object;
    // metadata?: NangoConfigMetadata;
    // is_public?: boolean | null;
    // pre_built?: boolean | null;
    // version?: string | null;
    // last_deployed?: string | null;
    // id?: number;

    // enabled?: boolean;
}

export interface ParsedNangoAction {
    name: string;
    type: 'action';
    description: string;
    input: NangoModel | NangoModelField | null;
    endpoint: NangoSyncEndpoint | null;
    // output: NangoModel[];
    scopes: string[];
    // returns: NangoModel[];
    models: NangoModel[];
    nango_yaml_version: 'v1' | 'v2';
}

export type LayoutMode = 'root' | 'nested';

export interface NangoModel {
    name: string;
    fields: NangoModelField[];
}
export interface NangoModelField {
    name: string;
    value: string | number | boolean | null | NangoModelField[];
    dynamic?: boolean;
    tsType?: boolean;
    model?: boolean;
}

export type NangoSyncEndpoint = {
    [key in HTTP_VERB]?: string;
};
