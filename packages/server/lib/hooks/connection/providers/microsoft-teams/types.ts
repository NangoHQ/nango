export interface TeamsDevPortalTokenResponse {
    token_type: 'Bearer';
    scope: string;
    expires_in: number;
    ext_expires_in: number;
    access_token: string;
    refresh_token: string;
}
