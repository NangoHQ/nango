import type { Endpoint } from '../api.js';

export interface AsyncActionResponse {
    id: string;
    statusUrl: string;
}

export type GetAsyncActionResult = Endpoint<{
    Method: 'GET';
    Path: `/action/:id`;
    Params: {
        id: string;
    };
    // This endpoint can actually return any json value (not just object)
    // but Endpoint definition is not flexible enough to support that.
    // TODO: fix Endpoint definition to support any json value
    Success: Record<string, any>;
}>;

export type PostPublicTriggerAction = Endpoint<{
    Method: 'POST';
    Path: '/action/trigger';
    Body: {
        action_name: string;
        input: any;
    };
    Headers: {
        'provider-config-key': string;
        'connection-id': string;
        'x-async'?: boolean;
        'x-max-retries'?: number;
    };
    Success: any;
}>;

export type GetPublicV1 = Endpoint<{
    Method: 'GET';
    Path: `/v1/:path`;
    Params: any;
    Body: any;
    Querystring: any;
    Headers: {
        'provider-config-key': string;
        'connection-id': string;
    };
    Success: any;
}>;
