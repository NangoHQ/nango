export type ConnectionDetailsResponse = {
    credentials: {
        access_token: string;
        type: 'OAUTH2' | 'OAUTH1';
        oauth_token_secret: string;
        oauth_token: string;
        raw: JSON;
    };
};
export type OAuth2TokenResponse = {
    oAuthToken: string;
    oAuthTokenSecret: string;
};

export type OAuth1TokenResponse = string;
export type TokenResponse = OAuth2TokenResponse | OAuth1TokenResponse;

export type ConnectionsResponse = {
    id: number;
    connection_id: number;
    provider: string;
    created: string;
};
