import type { TimestampsAndDeleted } from '../db';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { NangoModel, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml';
import type { JSONSchema7 } from 'json-schema';

export interface DBSyncConfig extends TimestampsAndDeleted {
    id: number;
    sync_name: string;
    nango_config_id: number;
    file_location: string;
    version: string;
    models: string[];
    active: boolean;
    runs: string | null;
    model_schema?: LegacySyncModelSchema[] | NangoModel[] | null | undefined;
    environment_id: number;
    track_deletes: boolean;
    type: ScriptTypeLiteral;
    auto_start: boolean;
    attributes: object;
    pre_built: boolean;
    is_public: boolean;
    metadata: NangoConfigMetadata;
    input: string | null;
    sync_type: SyncTypeLiteral | null;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema: JSONSchema7 | null;
    sdk_version: string | null;
}
export type DBSyncConfigInsert = Omit<DBSyncConfig, 'id'>;
