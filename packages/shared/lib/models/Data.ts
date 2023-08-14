export interface DataResponse {
    id?: string;
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface UpsertSummary {
    addedKeys: Array<string>;
    updatedKeys: Array<string>;
    deletedKeys?: Array<string>;
    affectedInternalIds: Array<string>;
    affectedExternalIds: Array<string>;
}
export interface UpsertResponse {
    success: boolean;
    summary?: UpsertSummary;
    error?: string;
}
