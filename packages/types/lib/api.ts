export interface ApiError<TCode extends string> {
    error: {
        code: TCode;
        message?: string | undefined;
    };
}

/**
 * API Request/Response type
 */
export interface Endpoint<
    T extends {
        Params?: Record<string, any>;
        Body?: Record<string, any>;
        Querystring?: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        Error?: ApiError<any> | never;
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        Success: Record<string, any> | never;
    }
> {
    // ------------
    // ------------ Request
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
    Errors: T['Error'];

    /**
     * Response body (success + error)
     */
    Reply: T['Error'] extends ApiError<any> ? T['Error'] | T['Success'] : T['Success'];
}
