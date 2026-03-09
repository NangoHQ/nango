export interface BotFrameworkTokenResponse {
    token_type: 'Bearer';
    expires_in: number;
    ext_expires_in?: number;
    access_token: string;
    scope?: string;
}
