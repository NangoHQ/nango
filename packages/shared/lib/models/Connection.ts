export interface CredentialsCommon {
    type: ProviderAuthModes;
    raw: Record<string, string>; // Raw response for credentials as received by the OAuth server or set by the user
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: ProviderAuthModes.OAuth2;
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: ProviderAuthModes.OAuth1;
    oauth_token: string;
    oauth_token_secret: string;
}

export enum ProviderAuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2'
}

export type AuthCredentials = OAuth2Credentials | OAuth1Credentials;

export interface BaseConnection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    account_id: number;
    metadata: Record<string, string>;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
}

export interface StoredConnection extends BaseConnection {
    credentials: Record<string, any>;
}

export interface Connection extends BaseConnection {
    credentials: AuthCredentials;
}
