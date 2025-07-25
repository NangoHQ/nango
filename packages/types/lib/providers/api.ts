import type { Endpoint } from '../api.js';
import type { Provider } from './provider.js';

export type GetPublicProviders = Endpoint<{
    Method: 'GET';
    Path: `/providers`;
    Querystring: { search?: string | undefined; connect_session_token?: string };
    Success: {
        data: ApiProvider[];
    };
}>;
export type ApiProvider = Provider & { name: string };

export type GetPublicProvider = Endpoint<{
    Method: 'GET';
    Path: `/providers/:provider`;
    Params: { provider: string };
    Querystring?: { connect_session_token: string };
    Success: {
        data: ApiProvider;
    };
}>;
