import type { ApiEndpoint } from '../api.js';
import type { AuthModeType } from '../auth/api.js';
import type { ListedNangoToolFunction } from '../functions/domain.js';
import type { JSONSchema7 } from 'json-schema';

export type ApiCatalogProviderSetup = { type: 'nango-managed-app'; scopes: string[] } | { type: 'none' } | { type: 'required' };

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
    setup: ApiCatalogProviderSetup;
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

export type ApiCatalogFunctionType = 'action' | 'sync' | 'tool';
export type ApiCatalogFunctionTypeFilter = 'sync' | 'tool';

export type ApiCatalogFunctionMeta = ListedNangoToolFunction['meta'];

export interface ApiCatalogFunction {
    name: string;
    type: ApiCatalogFunctionType;
    description: string | null;
    meta: ApiCatalogFunctionMeta;
}

export interface ApiCatalogActionFunction extends ApiCatalogFunction {
    type: 'action';
    input: string | null;
    returns: string[];
    json_schema: JSONSchema7 | null;
}

export interface ApiCatalogSyncFunction extends ApiCatalogFunction {
    type: 'sync';
    input: string | null;
    returns: string[];
    json_schema: JSONSchema7 | null;
    runs: string | null;
    auto_start: boolean;
    track_deletes: boolean;
}

export interface ApiCatalogToolFunction extends ApiCatalogFunction {
    type: 'tool';
    input_json_schema: JSONSchema7 | null;
    output_json_schema: JSONSchema7 | null;
}

export type ApiCatalogFunctionDetail = ApiCatalogActionFunction | ApiCatalogSyncFunction | ApiCatalogToolFunction;

export type GetPublicCatalogFunctions = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/catalog/providers/:provider/functions';
    Params: { provider: string };
    Querystring: { type?: ApiCatalogFunctionTypeFilter; search?: string; page?: number; limit?: number };
    Success: {
        data: ApiCatalogFunction[];
        pagination: { total: number; page: number; limit: number };
    };
}>;

export type GetPublicCatalogFunction = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/catalog/providers/:provider/functions/:name';
    Params: { provider: string; name: string };
    Querystring: { type?: ApiCatalogFunctionTypeFilter };
    Success: {
        data: ApiCatalogFunctionDetail;
    };
}>;
