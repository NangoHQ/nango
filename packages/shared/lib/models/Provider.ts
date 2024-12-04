import type { AuthModeType } from '@nangohq/types';
import type { NangoConnection } from './Connection.js';
import type { TimestampsAndDeleted } from './Generic.js';
import type { SyncConfig, Action } from './Sync.js';

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
    scopes: string;
    auth_mode: AuthModeType;
    app_link?: string;
    has_webhook: boolean;
    webhook_url?: string;
    syncs: SyncConfig[];
    actions: Action[];
    created_at: Date;
    connections: NangoConnection[];
    docs: string;
    connection_count: number;
}

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: SyncConfig[];
    actions: Action[];
}
