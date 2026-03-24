import type { Endpoint } from '../api.js';
import type { SyncDeploymentResult } from '../deploy/index.js';

export type SfFunctionType = 'action' | 'sync';

export interface SfProxyCall {
    method: string;
    endpoint: string;
    status: number;
    request: {
        params?: Record<string, unknown>;
        headers?: Record<string, unknown>;
        data?: unknown;
    };
    response: unknown;
    headers: Record<string, string>;
}

export interface SfSyncDryRunChanges {
    counts: {
        added: number;
        updated: number;
        deleted: number;
    };
    batchSave: Record<string, unknown[]>;
    batchUpdate: Record<string, unknown[]>;
    batchDelete: Record<string, unknown[]>;
    logs: unknown[];
}

export type PostSfDeploy = Endpoint<{
    Method: 'POST';
    Path: '/sf-deploy';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: SfFunctionType;
        code: string;
        environment: string;
    };
    Success: {
        integration_id: string;
        function_name: string;
        function_type: SfFunctionType;
        deployment: SyncDeploymentResult;
    };
}>;

export type PostSfRun = Endpoint<{
    Method: 'POST';
    Path: '/sf-run';
    Body: {
        integration_id: string;
        function_name: string;
        function_type: SfFunctionType;
        connection_id: string;
        environment: string;
        input?: unknown;
        test_input?: unknown;
        metadata?: unknown;
        checkpoint?: unknown;
        last_sync_date?: string;
    };
    Success:
        | {
              integration_id: string;
              function_name: string;
              function_type: 'action';
              output: unknown;
              proxy_calls: SfProxyCall[];
          }
        | {
              integration_id: string;
              function_name: string;
              function_type: 'sync';
              changes: SfSyncDryRunChanges;
              proxy_calls: SfProxyCall[];
          };
}>;
