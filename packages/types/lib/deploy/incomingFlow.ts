import type { NangoSyncEndpointOld, NangoSyncEndpointV2, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';
import type { OnEventType } from '../scripts/on-events/api';
import type { Merge } from 'type-fest';

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

export interface LegacySyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

export interface PreBuiltAction {
    type: 'action';
    models: string[];
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
    providerConfigKey: string;
    provider: string;
    is_public: boolean;
    public_route: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;
    fileBody?: IncomingScriptFiles;
    endpoints: NangoSyncEndpointV2[];
    input?: string | undefined;
    version?: string | null;
}
export interface PreBuiltSync {
    type: 'sync';
    models: string[];
    runs: string;
    auto_start?: boolean | undefined;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
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
    input?: string | undefined;
    version?: string | null;
}

export type PreBuiltFlowConfig = PreBuiltAction | PreBuiltSync;

// TODO: split into action | sync type
export interface CLIDeployFlowConfig {
    type: ScriptTypeLiteral;
    models: string[];
    runs: string | null;
    auto_start?: boolean;
    attributes?: object | undefined;
    metadata?: NangoConfigMetadata | undefined;
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
