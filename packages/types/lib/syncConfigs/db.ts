import type { JSONSchema7 } from 'json-schema';
import type { TimestampsAndDeleted } from '../db';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { NangoModel, NangoSyncEndpoint, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';

export interface DBSyncConfig extends TimestampsAndDeleted {
    id?: number;
    environment_id: number;
    sync_name: string;
    type: ScriptTypeLiteral;
    file_location: string;
    nango_config_id: number;
    models: string[];
    model_schema: LegacySyncModelSchema[] | NangoModel[];
    active: boolean;
    runs: string;
    track_deletes: boolean;
    auto_start: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    version?: string;
    pre_built?: boolean | null;
    is_public?: boolean | null;
    endpoints?: NangoSyncEndpoint[];
    input?: string | undefined;
    sync_type?: SyncTypeLiteral | undefined;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema?: JSONSchema7 | null;
}
