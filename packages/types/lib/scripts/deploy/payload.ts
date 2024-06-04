import type { NangoSyncEndpoint } from '../yaml/api.js';

export interface SyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

export interface NangoConfigMetadata {
    scopes?: string[];
    description?: string;
}

export interface SyncType {
    INITIAL: 'INITIAL';
    INCREMENTAL: 'INCREMENTAL';
    WEBHOOK: 'WEBHOOK';
    POST_CONNECTION_SCRIPT: 'POST_CONNECTION_SCRIPT';
    FULL: 'FULL';
    ACTION: 'ACTION';
}

export interface SyncConfigType {
    SYNC: 'sync';
    ACTION: 'action';
}

interface InternalIncomingPreBuiltScriptConfig {
    type: SyncConfigType;
    models: string[];
    runs: string;
    auto_start?: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    model_schema: string;
    input?: string | SyncModelSchema;
    endpoints?: NangoSyncEndpoint[];
}

export interface IncomingPreBuiltScriptConfig extends InternalIncomingPreBuiltScriptConfig {
    provider: string;
    is_public: boolean;
    public_route?: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;

    providerConfigKey?: string;
    fileBody?: {
        js: string;
        ts: string;
    };
}

export interface IncomingScriptConfig extends InternalIncomingPreBuiltScriptConfig {
    syncName: string;
    providerConfigKey: string;
    fileBody?: {
        js: string;
        ts: string;
    };
    version?: string;
    track_deletes?: boolean;
    sync_type?: SyncType;
    webhookSubscriptions?: string[];
}

export interface SlimSync {
    id?: number;
    name: string;
    auto_start?: boolean;
    sync_id?: string | null;
    providerConfigKey?: string;
    connections?: number;
    enabled?: boolean;
}

export interface SlimAction {
    id?: number;
    providerConfigKey?: string;
    name: string;
}

export interface ScriptDifferences {
    newSyncs: SlimSync[];
    deletedSyncs: SlimSync[];
    newActions: SlimAction[];
    deletedActions: SlimAction[];
}
