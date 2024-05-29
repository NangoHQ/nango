export interface Account {
    id: number;
    name: string;
    secret_key: string;
    host?: string | null;
    websockets_path?: string;
    uuid: string;
    is_admin?: boolean;
    is_capped?: boolean;
}
