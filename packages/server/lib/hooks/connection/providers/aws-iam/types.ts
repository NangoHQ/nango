export interface AWSAuthHeader {
    authorizationHeader: string;
    date: string;
}

export interface AWSIAMRequestParams {
    method: string;
    service: string;
    path: string;
    params: Record<string, string>;
}

export interface GetCallerIdentityResponse {
    GetCallerIdentityResult: {
        Account: string;
        Arn: string;
        UserId: string;
    };
    ResponseMetadata: {
        RequestId: string;
    };
}
export interface ErrorResponse {
    Error: {
        Code: string;
        Message: string;
        Type: string;
    };
    RequestId: string;
}

export interface AWSAuthHeaderParams {
    method: string;
    service: string;
    path: string;
    querystring: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}
