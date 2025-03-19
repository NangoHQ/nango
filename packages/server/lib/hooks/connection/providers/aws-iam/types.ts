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

export interface ListUsersResponse {
    '@xmlns': string;
    ListUsersResult: ListUsersResult;
    ResponseMetadata: ResponseMetadata;
}
interface ListUsersResult {
    Users: AWSIAMUser[];
    IsTruncated: boolean;
    Marker?: string;
}

interface ResponseMetadata {
    RequestId: string;
}

export interface AWSIAMUser {
    UserId: string;
    Path: string;
    UserName: string;
    Arn: string;
    CreateDate: string;
    PasswordLastUsed?: string;
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
