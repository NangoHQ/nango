import type { Merge } from 'type-fest';
import type { NangoModel, NangoSyncEndpointOld, NangoSyncEndpointV2, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';
import type { OnEventType } from '../scripts/on-events/api';

export interface IncomingScriptFiles {
    js: string;
    ts: string;
}
export interface IncomingOnEventScript {
    name: string;
    fileBody: IncomingScriptFiles;
    event: OnEventType;
}

export interface OnEventScriptsByProvider {
    providerConfigKey: string;
    scripts: IncomingOnEventScript[];
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
    type: ScriptTypeLiteral;
    models: string[];
    runs: string;
    auto_start?: boolean;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
    model_schema: string | NangoModel[];
    input?: string | LegacySyncModelSchema | undefined;
    endpoints?: (NangoSyncEndpointV2 | NangoSyncEndpointOld)[] | undefined;
    track_deletes: boolean;
    providerConfigKey: string;
}

export interface IncomingPreBuiltFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    provider: string;
    is_public: boolean;
    public_route: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;
    fileBody?: IncomingScriptFiles;
    endpoints: NangoSyncEndpointV2[];
}

export interface IncomingFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    syncName: string;
    fileBody: IncomingScriptFiles;
    version?: string | undefined;
    sync_type?: SyncTypeLiteral | undefined;
    webhookSubscriptions?: string[] | undefined;
}

export type CleanedIncomingFlowConfig = Merge<IncomingFlowConfig, { endpoints: NangoSyncEndpointV2[] }>;
