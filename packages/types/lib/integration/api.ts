import type { Endpoint } from '../api';

export type GetListIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/config';
    Success: {
        configs: {
            provider: string;
            unique_key: string;
        }[];
    };
}>;
