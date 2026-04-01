import type { ApiError, Endpoint } from '../api.js';

export type FunctionType = 'action' | 'sync';

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

// -------
// POST /remote-function/compile
// -------

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

// -------
// POST /remote-function/dryrun
// -------

export type PostRemoteFunctionDryrun = Endpoint<{
    Method: 'POST';
    Path: '/remote-function/dryrun';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: FunctionType;
        code: string;
        connection_id: string;
        /** Required when function_type is 'action' */
        input?: unknown;
        /** Optional for syncs */
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
        /** Raw stdout from nango dryrun */
        output: string;
    };
}>;

// -------
// POST /remote-function/deploy
// -------

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
        /** Raw stdout from nango deploy */
        output: string;
    };
}>;
