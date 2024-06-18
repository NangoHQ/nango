import type { NangoSyncEndpoint, SyncTypeLiteral } from '../nangoYaml';

export interface IncomingScriptFiles {
    js: string;
    ts: string;
}
export interface IncomingPostConnectionScript {
    name: string;
    fileBody: IncomingScriptFiles;
}

export interface PostConnectionScriptByProvider {
    providerConfigKey: string;
    scripts: IncomingPostConnectionScript[];
}

export interface NangoConfigMetadata {
    scopes?: string[] | undefined;
    description?: string | undefined;
}

// TODO: change that to use Parsed type
export interface LegacySyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

// TODO: split into action | sync type
interface InternalIncomingPreBuiltFlowConfig {
    type: 'action' | 'sync';
    models: string[];
    runs: string;
    auto_start?: boolean;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
    model_schema: string; // TODO: improve this type
    input?: string | LegacySyncModelSchema | undefined;
    endpoints?: NangoSyncEndpoint[] | undefined;
}

export interface IncomingPreBuiltFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    provider: string;
    is_public: boolean;
    public_route?: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;
    providerConfigKey?: string;
    fileBody?: IncomingScriptFiles;
}

export interface IncomingFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    syncName: string;
    providerConfigKey: string;
    fileBody: IncomingScriptFiles;
    version?: string | undefined;
    track_deletes?: boolean;
    sync_type?: SyncTypeLiteral | undefined;
    webhookSubscriptions?: string[] | undefined;
}
