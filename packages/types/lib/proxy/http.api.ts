import type { ApiEndpoint } from '../api.js';

export type AllPublicProxy = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
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
        'forward-headers-on-redirect'?: string | undefined;
        'nango-activity-log-id'?: string | undefined;
        'nango-is-sync'?: string | undefined;
        'nango-is-dry-run'?: string | undefined;
    };
    Success: any;
}>;
