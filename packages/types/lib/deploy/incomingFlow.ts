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
export interface PreBuiltFlowConfig {
    type: ScriptTypeLiteral;
    models: string[];
    runs: string | null;
    auto_start?: boolean | undefined;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
    model_schema: string | NangoModel[];
    track_deletes: boolean;
    providerConfigKey: string;
    provider: string;
    is_public: boolean;
    public_route: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;
    fileBody?: IncomingScriptFiles;
    endpoints: NangoSyncEndpointV2[];
    input?: NangoModel | LegacySyncModelSchema | undefined;
}

// TODO: split into action | sync type
export interface CLIDeployFlowConfig {
    type: ScriptTypeLiteral;
    models: string[];
    runs: string | null;
    auto_start?: boolean;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
    model_schema: string | NangoModel[];
    endpoints?: (NangoSyncEndpointV2 | NangoSyncEndpointOld)[] | undefined;
    track_deletes: boolean;
    providerConfigKey: string;
    input?: string | undefined;
    syncName: string;
    fileBody: IncomingScriptFiles;
    version?: string | undefined;
    sync_type?: SyncTypeLiteral | undefined;
    webhookSubscriptions?: string[] | undefined;
}

/**
 * Flow shape after being sent by the CLI and cleaned in the backend
 */
export type CleanedIncomingFlowConfig = Merge<CLIDeployFlowConfig, { endpoints: NangoSyncEndpointV2[] }>;
