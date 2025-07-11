export interface AttioTokenResponse {
    active: boolean;
    scope: string;
    client_id: string;
    token_type: 'Bearer';
    exp: number | null;
    iat: number;
    sub: string;
    aud: string;
    iss: 'attio.com';
    authorized_by_workspace_member_id: string | null;
    workspace_id: string;
    workspace_name: string;
    workspace_slug: string;
    workspace_logo_url: string | null;
}
