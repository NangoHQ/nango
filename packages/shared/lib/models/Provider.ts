import type { AuthModeType, DBConnection, DBSyncConfig } from '@nangohq/types';
import type { TimestampsAndDeleted } from './Generic.js';
import type { Action } from './Sync.js';

export interface Config extends TimestampsAndDeleted {
    id?: number | undefined;
    unique_key: string;
    provider: string;
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes?: string | undefined;
    environment_id: number;
    oauth_client_secret_iv?: string | null;
    oauth_client_secret_tag?: string | null;
    app_link?: string | null | undefined;
    custom?: Record<string, string> | undefined;
    missing_fields: string[];
}

export interface IntegrationWithCreds extends Integration {
    client_id: string;
    client_secret: string;
    scopes: string | undefined;
    auth_mode: AuthModeType;
    custom: any;
    app_link: string | null | undefined;
    has_webhook: boolean;
    webhook_url: string | null;
    webhook_secret: string | null;
    has_webhook_user_defined_secret: boolean;
    syncs: (Pick<DBSyncConfig, 'created_at' | 'updated_at'> & { name: string; description: string | null })[];
    actions: Action[];
    created_at: Date;
    connections: Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id' | 'connection_config'>[];
    docs: string;
    connection_count: number;
}

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: (Pick<DBSyncConfig, 'created_at' | 'updated_at'> & { name: string; description: string | null })[];
    actions: Action[];
}
