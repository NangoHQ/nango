import type { DBGettingStartedMeta, DBGettingStartedProgress } from './db.js';
import type { DBConnection } from '../connection/db.js';
import type { DBEnvironment } from '../environment/db.js';
import type { IntegrationConfig } from '../integration/db.js';

export interface GettingStartedOutput {
    meta: {
        environment: Pick<DBEnvironment, 'id' | 'name'>;
        integration: Pick<IntegrationConfig, 'id' | 'unique_key' | 'provider' | 'display_name'>;
    };
    connection: Pick<DBConnection, 'id' | 'connection_id'> | null;
    step: number;
    closed: boolean;
}

export interface PatchGettingStartedInput {
    connection_id?: string | null | undefined;
    step?: number | undefined;
    closed?: boolean | undefined;
}

export type CreateGettingStartedMeta = Omit<DBGettingStartedMeta, 'id' | 'created_at' | 'updated_at'>;
export type CreateGettingStartedProgress = Omit<DBGettingStartedProgress, 'id' | 'created_at' | 'updated_at'>;
