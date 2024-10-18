export interface GustoTokenInfoResponse {
    scope: string;
    resource: {
        type: string;
        uuid: string;
    };
    resource_owner: {
        type: string;
        uuid: string;
    };
}
