export interface DBUsage {
    id: number;
    accountId: number;
    month: Date;
    actions: number;
    active_records: number;
    created_at?: string;
    updated_at?: string;
}
