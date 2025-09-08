import type { Endpoint } from '../api.js';

export type AllPublicProxy = Endpoint<{
    Method: 'GET';
    Path: `/proxy/:anyPath`;
    Params: any;
    Body: any;
    Querystring: any;
    Headers: {
        'connection-id': string;
        'provider-config-key': string;
        retries?: number | undefined;
        'base-url-override'?: string | undefined;
        decompress?: string | undefined;
        'retry-on'?: string | undefined;
        'nango-activity-log-id'?: string | undefined;
        'nango-is-sync'?: string | undefined;
        'nango-is-dry-run'?: string | undefined;
    };
    Success: any;
}>;
