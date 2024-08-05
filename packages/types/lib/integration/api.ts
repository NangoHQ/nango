import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { Template } from './template';

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

export type PostIntegration = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/integrations';
    Body: { provider: string };
    Success: {
        data: ApiIntegration;
    };
}>;

export type ApiIntegration = Merge<IntegrationConfig, ApiTimestamps>;
export type GetIntegration = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:id';
    Params: { integrationId: string };
    Success: {
        data: {
            integration: ApiIntegration;
            template: Template;
            meta: {
                connectionsCount: number;
                webhookUrl: string | null;
                webhookSecret: string | null;
            };
        };
    };
}>;

export type PatchIntegration = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/integrations/:id';
    Params: { integrationId: string };
    Body: { integrationId?: string | undefined };
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

export type DeleteIntegration = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/integrations/:id';
    Params: { integrationId: string };
    Success: {
        data: {
            success: boolean;
        };
    };
}>;
