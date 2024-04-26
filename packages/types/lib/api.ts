export interface ApiError<TCode extends string> {
    error: {
        code: TCode;
        message?: string | undefined;
    };
}

export interface Res<
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
    Params: T['Params'] extends Record<string, any> ? T['Params'] : never;
    Success: T['Success'];
    Errors: T['Error'];
    Reply: T['Error'] extends ApiError<any> ? T['Error'] | T['Success'] : T['Success'];
    Body: T['Body'] extends Record<string, any> ? T['Body'] : never;
    Query: T['Querystring'] extends Record<string, any> ? T['Querystring'] : never;
    // Querystring + Params
    QP: (T['Params'] extends Record<string, any> ? T['Params'] : never) & (T['Querystring'] extends Record<string, any> ? T['Querystring'] : never);
}
