export interface DataResponse {
    id?: string;
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface UpsertSummary {
    addedKeys: string[];
    updatedKeys: string[];
    deletedKeys?: string[];
    affectedInternalIds: string[];
    affectedExternalIds: string[];
}
export interface UpsertResponse {
    success: boolean;
    summary?: UpsertSummary;
    error?: string;
}
