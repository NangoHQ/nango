import type { ApiEndpoint } from '../api.js';
import type { AuthModeType } from '../auth/api.js';
import type { ProviderInstantSetup } from '../providers/api.js';

export interface ApiCatalogProvider {
    name: string;
    display_name: string;
    categories: string[];
    auth_mode: AuthModeType;
    logo_url: string;
    docs: string;
    docs_connect: string | null;
    setup_guide_url: string | null;
    default_scopes: string[];
    instant_setup: ProviderInstantSetup;
    function_counts: { tool: number; sync: number };
}

export type GetPublicCatalogProviders = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/catalog/providers';
    Querystring: { search?: string; page?: number; limit?: number };
    Success: {
        data: ApiCatalogProvider[];
        pagination: { total: number; page: number; limit: number };
    };
}>;

export type GetPublicCatalogProvider = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/catalog/providers/:provider';
    Params: { provider: string };
    Success: {
        data: ApiCatalogProvider;
    };
}>;
