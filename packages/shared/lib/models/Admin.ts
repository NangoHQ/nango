export interface Account {
    id: number;
    name: string;
    secret_key: string;
    owner_id: number | undefined;
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
