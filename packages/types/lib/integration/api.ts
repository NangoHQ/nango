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

export type DeleteIntegrationPublic = Endpoint<{
    Method: 'DELETE';
    Path: '/config/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: { success: true };
}>;

export type DeleteIntegration = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/integration/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: {
        data: { success: boolean };
    };
}>;
