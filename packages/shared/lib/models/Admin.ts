export interface Account {
    id: number;
    name: string;
    secret_key: string;
    public_key: string;
    callback_url: string | null;
    owner_id: number | undefined;
    secret_key_iv?: string | null;
    secret_key_tag?: string | null;
    host?: string | null;
}
