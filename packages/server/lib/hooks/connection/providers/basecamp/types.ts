export interface BasecampAuthorizationResponse {
    expires_at: string;
    identity: {
        id: number;
        first_name: string;
        last_name: string;
        email_address: string;
    };
    accounts: {
        product: string;
        id: number;
        name: string;
        href: string;
        app_href: string;
    }[];
}
