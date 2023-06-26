export interface Account {
    id: number;
    name: string;
    secret_key: string;
    public_key: string;
    callback_url: string | null;
    webhook_url: string | null;
    owner_id: number | undefined;
    secret_key_iv?: string | null;
    secret_key_tag?: string | null;
    host?: string | null;
    websockets_path?: string;
}

export interface User {
    id: number;
    email: string;
    name: string;
    hashed_password: string;
    salt: string;
    account_id: number;
    reset_password_token: string | undefined;
}
