import type { OnEventType } from '../scripts/on-events/api.js';
import type { Feature } from '../syncConfigs/db.js';
import type { JSONSchema7 } from 'json-schema';

export type HTTP_METHOD = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
/** @deprecated **/
export type SyncTypeLiteral = 'incremental' | 'full';
export type ScriptFileType = 'actions' | 'syncs' | 'on-events' | 'functions' | 'webhooks' | 'post-connection-scripts'; // post-connection-scripts is deprecated
export type ScriptTypeLiteral = 'action' | 'sync' | 'on-event';
/**
 * The `function` primitive is authored via `createFunction()` / `createWebhook()`. It is tracked
 * separately from {@link ScriptTypeLiteral} (sync/action/on-event) while it is introduced additively.
 */
export type FunctionScriptTypeLiteral = 'function';

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
    functions: ParsedNangoFunction[];
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
    /** @deprecated **/
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
    // TODO: make non-optional when nango-yaml is fully removed
    json_schema?: JSONSchema7 | undefined;
    features?: Feature[] | undefined;
}

/** Serializable view of a function trigger (the executable hooks live in the deployed file body). */
export interface ParsedFunctionTrigger {
    type: 'http' | 'schedule' | 'event';
    /** http trigger: maps to the URL path segment. */
    name?: string;
    /** http trigger: 'integration' (default) or 'connection' for tokenized per-connection URLs. */
    scope?: 'integration' | 'connection';
    /** schedule trigger. */
    schedule?: string;
    /** event trigger. */
    event?: string;
    /** Whether ingress coalescing is configured (the window/key config). */
    debounce?: {
        key?: { body: string } | { header: string };
        windowMs: number;
        maxWindowMs?: number;
        maxEntities?: number;
        payloadMode?: 'latest' | 'all';
    };
    /** Whether the trigger ships an `ingressChallenge` hook (executed at ingress). */
    hasIngressChallenge?: boolean;
    /** Whether the trigger ships an `ingressValidation` hook (executed at ingress). */
    hasIngressValidation?: boolean;
}

export interface ParsedNangoFunction {
    name: string;
    type: 'function';
    description: string;
    triggers: ParsedFunctionTrigger[];
    input: string | null;
    output: string[] | null;
    scopes: string[];
    usedModels: string[];
    version: string;
    json_schema?: JSONSchema7 | undefined;
    features?: Feature[] | undefined;
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
    // TODO: make non-optional when nango-yaml is fully removed
    json_schema?: JSONSchema7 | undefined;
    features?: Feature[] | undefined;
}

export type LayoutMode = 'root' | 'nested';

// TODO: delete when fully replaced by json-schema
export interface NangoModel {
    name: string;
    description?: string | undefined;
    fields: NangoModelField[];
    isAnon?: boolean | undefined;
}

// TODO: delete when fully replaced by json-schema
export interface NangoModelField {
    name: string;
    value: string | number | boolean | null | NangoModelField[];
    description?: string | undefined;
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
    group?: string | null | undefined;
}

// --- Flows Yaml is a modified nango.yaml
export interface FlowsYaml {
    integrations: Record<string, NangoYamlV2Integration & { models: NangoYamlModel }>;
}

// --- flows.zero.json is a parsed nango.yaml
// TODO: drop the functions override once flows.zero.json is regenerated with `functions` (NAN-5943)
export type FlowZeroJson = Omit<NangoYamlParsedIntegration, 'functions'> & { jsonSchema?: JSONSchema7; sdkVersion: string };
export type FlowsZeroJson = FlowZeroJson[];
