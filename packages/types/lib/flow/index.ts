import type { NangoConfigMetadata } from '../deploy/incomingFlow.js';
import type { NangoSyncEndpointV2, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml/index.js';
import type { JSONSchema7 } from 'json-schema';

// TODO: Split by type
export interface NangoSyncConfig {
    name: string;
    type?: ScriptTypeLiteral;
    runs?: string | null;
    auto_start?: boolean;
    attributes?: object;
    description?: string;
    scopes?: string[];
    metadata?: NangoConfigMetadata;
    track_deletes?: boolean;
    returns: string[];
    endpoints: NangoSyncEndpointV2[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: string | undefined;
    sync_type?: SyncTypeLiteral;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: string;
    is_zero_yaml: boolean;
    sdk_version: string | null;
}

export interface StandardNangoConfig {
    providerConfigKey: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
    [`on-events`]: NangoSyncConfig[];
}
