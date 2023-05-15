export interface DataResponse {
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
}

export interface UpsertResponse {
    addedKeys: Array<string>;
    updatedKeys: Array<string>;
    affectedInternalIds: Array<string>;
    affectedExternalIds: Array<string>;
}
