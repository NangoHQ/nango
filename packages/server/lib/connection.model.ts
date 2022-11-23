export interface Connection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    integration: string;
    connection_id: string;
    credentials: object;
    raw_response: object;
}
