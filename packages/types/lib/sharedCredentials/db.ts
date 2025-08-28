import type { Timestamps } from '../db.js';

export interface SharedCredentials {
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes?: string;
    oauth_client_secret_iv: string;
    oauth_client_secret_tag: string;
}

export interface DBSharedCredentials extends Timestamps {
    id: number;
    name: string;
    credentials: SharedCredentials;
}
