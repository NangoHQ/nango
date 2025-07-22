export interface DBAccountUsage {
    id: number;
    account_id: number;
    month: Date;
    actions: number;
    active_records: number;
    created_at: string;
    updated_at: string;
}
