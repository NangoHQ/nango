export interface SophosWhoamiResponse {
    id: string;
    idType: string;
    apiHosts: {
        global: string;
        dataRegion?: string;
    };
}
