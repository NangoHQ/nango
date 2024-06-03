import type { TimestampsAndDeleted } from '../db.js';

export interface IntegrationConfig extends TimestampsAndDeleted {
    id?: number;
    unique_key: string;
    provider: string;
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes?: string;
    environment_id: number;
    oauth_client_secret_iv?: string | null;
    oauth_client_secret_tag?: string | null;
    app_link?: string | null;
    custom?: Record<string, string>;
}
