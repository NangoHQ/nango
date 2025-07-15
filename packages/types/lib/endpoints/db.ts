import type { Timestamps } from '../db.js';
import type { HTTP_METHOD } from '../nangoYaml/index.js';
import type { SetOptional } from 'type-fest';

export interface DBSyncEndpoint extends Timestamps {
    id: number;
    sync_config_id: number;
    method: HTTP_METHOD;
    path: string;
    model: string | null;
    group_name: string | null;
}
export type DBSyncEndpointCreate = SetOptional<Omit<DBSyncEndpoint, 'id'>, 'model' | 'group_name'>;
