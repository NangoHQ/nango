export interface APIDetailsResponse {
    id: string;
    jsonrpc: string;
    result: {
        enabledApis: string[];
        createdAt: string;
    };
}
