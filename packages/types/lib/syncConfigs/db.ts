import type { TimestampsAndDeleted } from '../db.js';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow.js';
import type { NangoModel, ScriptTypeLiteral, SyncTypeLiteral } from '../nangoYaml/index.js';
import type { JSONSchema7 } from 'json-schema';

export type Feature = 'checkpoints';

export type FunctionSource = 'catalog' | 'standalone' | 'repo';

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
    // TODO: make required at second release for smooth rollout
    source?: FunctionSource | undefined;
    /** @deprecated use `source`. Dual-written during the rollout so old readers still classify catalog rows correctly. */
    pre_built?: boolean | undefined;
    /** @deprecated use `source`. Dual-written during the rollout so old readers still classify catalog rows correctly. */
    is_public?: boolean | undefined;
    metadata: NangoConfigMetadata;
    input: string | null;
    /** @deprecated **/
    sync_type: SyncTypeLiteral | null;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema: JSONSchema7 | null;
    sdk_version: string | null;
    features: Feature[];
}
export type DBSyncConfigInsert = Omit<DBSyncConfig, 'id'>;
