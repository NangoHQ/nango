export interface DataResponse {
    id?: string;
    [index: string]: null | undefined | object | string | number | boolean | Record<string, string | boolean | number>;
}

export interface UpsertSummary {
    addedKeys: string[];
    updatedKeys: string[];
    deletedKeys?: string[];
}
export interface UpsertResponse {
    success: boolean;
    summary?: UpsertSummary;
    error?: string;
}
