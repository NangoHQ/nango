import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow.js';
import type { NangoModel, NangoSyncEndpointV2, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml/index.js';
import type { Feature, FunctionSource } from '../syncConfigs/db.js';
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
    // TODO: make required at second release for smooth rollout
    source?: FunctionSource | undefined;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: string | undefined;
    /** @deprecated **/
    sync_type?: SyncTypeLiteral;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: string;
    sdk_version: string | null;
    // Temporary regression
    models?: NangoModel[] | LegacySyncModelSchema[] | undefined;
    features: Feature[];
}

export interface StandardNangoConfig {
    providerConfigKey: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
    [`on-events`]: NangoSyncConfig[];
}
