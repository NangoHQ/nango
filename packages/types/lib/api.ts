export interface ApiError<TCode extends string, TErrors = any, P = unknown> {
    error: {
        code: TCode;
        message?: string | undefined;
        errors?: TErrors;
        payload?: P;
    };
}
export interface ValidationError {
    code: string;
    message: string;
    path: (string | number)[];
}

export type ResDefaultErrors =
    | ApiError<'not_found'>
    | ApiError<'invalid_query_params', ValidationError[]>
    | ApiError<'invalid_body', ValidationError[]>
    | ApiError<'invalid_uri_params', ValidationError[]>
    | ApiError<'feature_disabled'>
    | ApiError<'missing_auth_header'>
    | ApiError<'generic_error_support', undefined, string>
    | ApiError<'server_error'>
    | ApiError<'resource_capped'>;

export type EndpointMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
/**
 * API Request/Response type
 */
export interface EndpointDefinition {
    Method: EndpointMethod;
    Path: string;
    Params?: Record<string, any>;
    Body?: Record<string, any>;
    Querystring?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    Error?: ApiError<any> | never;
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    Success: Record<string, any> | never;
}
export interface Endpoint<T extends EndpointDefinition> {
    // ------------
    // ------------ Request
    Method: T['Method'];
    Path: T['Path'];
    /**
     * URL params
     */
    Params: T['Params'] extends Record<string, any> ? T['Params'] : never;

    /**
     * URL query string
     */
    Querystring: T['Querystring'] extends Record<string, any> ? T['Querystring'] : never;

    /**
     * Helpers: Querystring + Params
     */
    QP: (T['Params'] extends Record<string, any> ? T['Params'] : never) & (T['Querystring'] extends Record<string, any> ? T['Querystring'] : never);

    /**
     * Received body
     */
    Body: T['Body'] extends Record<string, any> ? T['Body'] : never;

    // ------------
    // ------------ Response
    /**
     * Response body for success
     */
    Success: T['Success'];

    /**
     * Response body for any error
     */
    Errors: T['Error'] extends { error: any } ? ResDefaultErrors | T['Error'] : ResDefaultErrors;

    /**
     * Response body (success + error)
     */
    Reply: ResDefaultErrors | (T['Error'] extends ApiError<any> ? T['Error'] | T['Success'] : T['Success']);
}

export interface ErrorPayload {
    type: string;
    description: string;
}

export interface ApiTimestamps {
    created_at: string;
    updated_at: string;
}
