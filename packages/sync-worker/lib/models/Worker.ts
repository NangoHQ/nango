import type { Connection } from '@nangohq/nango-server/dist/models.js';

export interface ContinuousSyncArgs {
    nangoConnectionId: number;
}

export type NangoConnection = Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'account_id'>;
