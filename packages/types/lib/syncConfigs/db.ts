import type { JSONSchema7 } from 'json-schema';
import type { TimestampsAndDeleted } from '../db';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { NangoModel, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';

export interface DBSyncConfig extends TimestampsAndDeleted {
    id: number;
    sync_name: string;
    nango_config_id: number;
    file_location: string;
    version: string;
    models: string[] | null;
    active: boolean;
    runs: string | null;
    model_schema: LegacySyncModelSchema[] | NangoModel[] | null;
    environment_id: number;
    track_deletes: boolean;
    type: ScriptTypeLiteral;
    auto_start: boolean;
    attributes: object;
    pre_built: boolean;
    is_public: boolean;
    metadata: NangoConfigMetadata;
    input: string | undefined;
    sync_type: SyncTypeLiteral | undefined;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema: JSONSchema7 | null;
}
