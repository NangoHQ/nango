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
        input: unknown;
    };
    Headers: {
        'provider-config-key': string;
        'connection-id': string;
        'x-async'?: boolean;
        'x-max-retries'?: number;
    };
    Success: any;
}>;

export type PostInternalTriggerFunction = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/trigger/function';
    Body: {
        type: 'action' | 'sync';
        function_name: string;
        provider_config_key: string;
        connection_id: string;
        input?: unknown;
    };
    Querystring: { env: string };
    Success: any;
}>;

/** @deprecated Use POST /action/trigger to trigger actions and GET /records to fetch sync records instead. */
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
