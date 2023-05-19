export interface SyncDataRecord {
    id?: string;
    external_id: string;
    json: object;
    data_hash: string;
    nango_connection_id: number;
    model: string;
    created_at?: Date;
    updated_at?: Date;
}
