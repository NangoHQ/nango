import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { ScriptTypeLiteral } from '../nangoYaml/index.js';

export type PutUpgradePreBuiltFlow = ApiEndpoint<{
    Audit: AuditPolicy<'function', 'upgraded', 'environment'>;
    Method: 'PUT';
    Path: '/api/v1/flows/pre-built/upgrade';
    Querystring: { env: string };
    Body: {
        id: number;
        provider: string;
        scriptName: string;
        type: ScriptTypeLiteral;
        upgradeVersion: string;
        lastDeployed: string;
        providerConfigKey: string;
    };
    Error: ApiError<'upgrade_failed'> | ApiError<'unknown_provider'> | ApiError<'unknown_sync_config'> | ApiError<'unknown_flow'> | ApiError<'invalid_version'>;
    Success: {
        success: true;
    };
}>;

export type PostPreBuiltDeploy = ApiEndpoint<{
    Audit: AuditPolicy<'function', 'deployed', 'environment'>;
    Method: 'POST';
    Path: '/api/v1/flows/pre-built/deploy';
    Querystring: { env: string };
    Body: {
        providerConfigKey: string;
        scriptName: string;
        type: ScriptTypeLiteral;
    };
    Error: ApiError<'unknown_provider'> | ApiError<'failed_to_deploy', Error[]>;
    Success: {
        data: {
            id: number;
        };
    };
}>;

export type PatchFlowEnable = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'enabled', 'environment'>;
    Method: 'PATCH';
    Path: '/api/v1/flows/:id/enable';
    Querystring: { env: string };
    Params: { id: number };
    Body: {
        provider: string;
        providerConfigKey: string;
        scriptName: string;
        type: ScriptTypeLiteral;
    };
    Error: ApiError<'unknown_provider'> | ApiError<'resource_capped'> | ApiError<'unknown_sync_config'>;
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

export type PatchFlowDisable = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'disabled', 'environment'>;
    Method: 'PATCH';
    Path: '/api/v1/flows/:id/disable';
    Querystring: { env: string };
    Params: { id: number };
    Body: {
        provider: string;
        providerConfigKey: string;
        scriptName: string;
        type: ScriptTypeLiteral;
    };
    Error: ApiError<'unknown_provider'>;
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

export type PatchFlowFrequency = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'frequency_changed', 'environment'>;
    Method: 'PATCH';
    Path: '/api/v1/flows/:id/frequency';
    Querystring: { env: string };
    Params: { id: number };
    Body: {
        provider: string;
        providerConfigKey: string;
        scriptName: string;
        type: ScriptTypeLiteral;
        frequency: string;
    };
    Error: ApiError<'unknown_provider'> | ApiError<'unknown_sync_config'> | ApiError<'failed_to_update_frequency'>;
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

export type GetFlowDownload = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/flows/:id/download';
    Querystring: { env: string };
    Params: { id: number };
    Success: never;
    Error: ApiError<'failed_to_download_flow'>;
}>;
