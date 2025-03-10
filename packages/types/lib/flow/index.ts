import type { JSONSchema7 } from 'json-schema';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { NangoModel, NangoSyncEndpointV2, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';

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
    models: NangoModel[] | LegacySyncModelSchema[];
    endpoints: NangoSyncEndpointV2[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: NangoModel | LegacySyncModelSchema | undefined;
    sync_type?: SyncTypeLiteral;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: string;
}

export interface StandardNangoConfig {
    providerConfigKey: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
    [`on-events`]: NangoSyncConfig[];
}
