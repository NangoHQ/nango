import type { ApiError, Endpoint } from '../api.js';
import type { DeployedNangoFunction, FunctionType, NangoActionFunction, NangoFunctionTemplate, NangoSyncFunction } from './domain.js';

export type FunctionErrorCode =
    | 'invalid_request'
    | 'integration_not_found'
    | 'compilation_error'
    | 'dryrun_error'
    | 'deployment_error'
    | 'connection_not_found'
    | 'function_disabled'
    | 'timeout'
    | 'validation_error';

export interface ProxyCall {
    method: string;
    endpoint: string;
    status: number;
    request: {
        params?: Record<string, unknown>;
        headers?: Record<string, unknown>;
        data?: unknown;
    };
    response: unknown;
    headers: Record<string, unknown>;
}

export type PostRemoteFunctionCompile = Endpoint<{
    Method: 'POST';
    Path: '/remote-function/compile';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        code: string;
    };
    Error: ApiError<FunctionErrorCode>;
    Success: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        bundle_size_bytes: number;
        bundled_js: string;
        compiled_at: string;
    };
}>;

export type PostRemoteFunctionDryrun = Endpoint<{
    Method: 'POST';
    Path: '/remote-function/dryrun';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        code: string;
        connection_id: string;
        input?: unknown;
        metadata?: Record<string, unknown> | undefined;
        checkpoint?: Record<string, unknown> | undefined;
        last_sync_date?: string | undefined;
    };
    Error: ApiError<FunctionErrorCode>;
    Success: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        execution_timeout_at: string;
        duration_ms: number;
        result?: unknown;
    };
}>;

export type PostRemoteFunctionDeploy = Endpoint<{
    Method: 'POST';
    Path: '/remote-function/deploy';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        code: string;
    };
    Error: ApiError<FunctionErrorCode>;
    Success: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        deployed: boolean;
        deployed_functions: { name: string; version: string }[];
        output: string;
    };
}>;

export type GetIntegrationFunctions = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey/functions';
    Querystring: {
        env: string;
        type?: FunctionType;
        search?: string;
        page?: number;
        limit?: number;
    };
    Params: { providerConfigKey: string };
    Success: {
        data: DeployedNangoFunction[];
        pagination: { total: number; page: number; limit: number };
    };
}>;

export type GetIntegrationFunction = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey/functions/:functionName';
    Querystring: { env: string; type?: FunctionType };
    Params: { providerConfigKey: string; functionName: string };
    Success: { data: DeployedNangoFunction };
}>;

export type GetProviderTemplates = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/providers/:providerConfigKey/templates';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Success: { data: (NangoSyncFunction | NangoActionFunction)[] };
}>;

export type GetIntegrationTemplates = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey/templates';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Success: { data: NangoFunctionTemplate[] };
}>;
