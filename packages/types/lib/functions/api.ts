import type { ApiError, Endpoint } from '../api.js';
import type { DeployedNangoFunction, FunctionType, NangoActionFunction, NangoFunctionTemplate, NangoSyncFunction } from './domain.js';

export type RunnableFunctionType = Extract<FunctionType, 'action' | 'sync'>;

export type FunctionErrorCode =
    | 'invalid_request'
    | 'integration_not_found'
    | 'compilation_error'
    | 'dryrun_error'
    | 'deployment_error'
    | 'connection_not_found'
    | 'dryrun_not_found'
    | 'deployment_not_found'
    | 'function_disabled'
    | 'execution_environment_unavailable'
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

export interface FunctionCompileBody {
    code: string;
}

export interface FunctionCompileSuccess {
    bundle_size_bytes: number;
    bundled_js: string;
    compiled_at: string;
}

export interface FunctionDryrunBody {
    integration_id: string;
    function_type: RunnableFunctionType;
    code: string;
    connection_id: string;
    input?: unknown;
    metadata?: Record<string, unknown> | undefined;
    checkpoint?: Record<string, unknown> | undefined;
    last_sync_date?: string | undefined;
}

export type FunctionAsyncJobStatus = 'waiting' | 'running' | 'success' | 'failed';
export type FunctionDryrunStatus = FunctionAsyncJobStatus;
export type FunctionDeploymentStatus = FunctionAsyncJobStatus;

export interface FunctionDryrunCreateSuccess {
    id: string;
    status: Extract<FunctionDryrunStatus, 'waiting' | 'running'>;
    created_at: string;
}

export interface FunctionDryrunResultSuccess {
    id: string;
    status: FunctionDryrunStatus;
    integration_id: string;
    function_type: RunnableFunctionType;
    created_at: string;
    updated_at: string;
    started_at?: string | undefined;
    completed_at?: string | undefined;
    duration_ms?: number | undefined;
    output?: string | undefined;
    result?: unknown;
    error?: ApiError<FunctionErrorCode>['error'] | undefined;
}

export type FunctionDryrunResultBody =
    | {
          status: 'success';
          output: string;
          duration_ms?: number | undefined;
      }
    | {
          status: 'failed';
          output?: string | undefined;
          duration_ms?: number | undefined;
          error: {
              code?: string | undefined;
              message: string;
              payload?: unknown;
          };
      };

export interface FunctionDeploymentBody {
    type: 'function';
    integration_id: string;
    function_name: string;
    function_type: RunnableFunctionType;
    code: string;
    version?: string | undefined;
    allow_destructive?: boolean | undefined;
}

export interface FunctionDeploymentCreateSuccess {
    id: string;
    status: Extract<FunctionDeploymentStatus, 'waiting' | 'running'>;
    created_at: string;
}

export interface FunctionDeploymentResultSuccess {
    id: string;
    status: FunctionDeploymentStatus;
    integration_id: string;
    function_name: string;
    function_type: RunnableFunctionType;
    created_at: string;
    updated_at: string;
    started_at?: string | undefined;
    completed_at?: string | undefined;
    duration_ms?: number | undefined;
    deployed?: boolean | undefined;
    deployed_functions?: { name: string; version: string }[] | undefined;
    output?: string | undefined;
    error?: ApiError<FunctionErrorCode>['error'] | undefined;
}

export type FunctionDeploymentResultBody =
    | {
          status: 'success';
          output: string;
          duration_ms?: number | undefined;
      }
    | {
          status: 'failed';
          output?: string | undefined;
          duration_ms?: number | undefined;
          error: {
              code?: string | undefined;
              message: string;
              payload?: unknown;
          };
      };

export type PostFunctionCompile = Endpoint<{
    Method: 'POST';
    Path: '/functions/compile';
    Body: FunctionCompileBody;
    Error: ApiError<FunctionErrorCode>;
    Success: FunctionCompileSuccess;
}>;

export type PostFunctionDryrun = Endpoint<{
    Method: 'POST';
    Path: '/functions/dryruns';
    Body: FunctionDryrunBody;
    Error: ApiError<FunctionErrorCode>;
    Success: FunctionDryrunCreateSuccess;
}>;

export type GetFunctionDryrun = Endpoint<{
    Method: 'GET';
    Path: '/functions/dryruns/:id';
    Params: { id: string };
    Error: ApiError<FunctionErrorCode>;
    Success: FunctionDryrunResultSuccess;
}>;

export type PostFunctionDryrunResult = Endpoint<{
    Method: 'POST';
    Path: '/functions/dryruns/:id/result';
    Params: { id: string };
    Body: FunctionDryrunResultBody;
    Error: ApiError<FunctionErrorCode>;
    Success: { ok: true };
}>;

export type PostFunctionDeployment = Endpoint<{
    Method: 'POST';
    Path: '/functions/deployments';
    Body: FunctionDeploymentBody;
    Error: ApiError<FunctionErrorCode>;
    Success: FunctionDeploymentCreateSuccess;
}>;

export type GetFunctionDeployment = Endpoint<{
    Method: 'GET';
    Path: '/functions/deployments/:id';
    Params: { id: string };
    Error: ApiError<FunctionErrorCode>;
    Success: FunctionDeploymentResultSuccess;
}>;

export type PostFunctionDeploymentResult = Endpoint<{
    Method: 'POST';
    Path: '/functions/deployments/:id/result';
    Params: { id: string };
    Body: FunctionDeploymentResultBody;
    Error: ApiError<FunctionErrorCode>;
    Success: { ok: true };
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

export type DeleteIntegrationFunction = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/integrations/:providerConfigKey/functions/:functionName';
    /** TODO: support deleting on-event functions */
    Querystring: { env: string; type: 'sync' | 'action' };
    Params: { providerConfigKey: string; functionName: string };
    Error: ApiError<'function_managed_by_deploy'>;
    Success: { data: { success: boolean } };
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
