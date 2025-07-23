export interface MailchimpUser {
    dc: string;
    role: string;
    accountname: string;
    user_id: number;
    login: {
        email: string;
        avatar: string | null;
        login_id: number;
        login_name: string;
        login_email: string;
    };
    login_url: string;
    api_endpoint: string;
}
