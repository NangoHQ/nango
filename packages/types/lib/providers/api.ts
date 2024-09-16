import type { Endpoint } from '../api';
import type { Provider } from '../integration/template';

export type GetPublicProviders = Endpoint<{
    Method: 'GET';
    Path: `/providers`;
    Querystring: { query?: string | undefined };
    Success: {
        data: ApiProvider[];
    };
}>;
export type ApiProvider = Provider & { name: string };

export type GetPublicProvider = Endpoint<{
    Method: 'GET';
    Path: `/providers/:providerName`;
    Params: { providerName: string };
    Success: {
        data: ApiProvider;
    };
}>;
