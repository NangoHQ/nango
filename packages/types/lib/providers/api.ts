import type { Endpoint } from '../api';
import type { Provider } from './provider';

export type GetPublicProviders = Endpoint<{
    Method: 'GET';
    Path: `/providers`;
    Querystring: { search?: string | undefined };
    Success: {
        data: ApiProvider[];
    };
}>;
export type ApiProvider = Provider & { name: string };

export type GetPublicProvider = Endpoint<{
    Method: 'GET';
    Path: `/providers/:provider`;
    Params: { provider: string };
    Success: {
        data: ApiProvider;
    };
}>;
