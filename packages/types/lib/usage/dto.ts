export interface CreateUsageDto {
    accountId: number;
    month: string;
    actions?: number;
    active_records?: number;
}

export interface UpdateUsageDto {
    actions?: number;
    active_records?: number;
}
