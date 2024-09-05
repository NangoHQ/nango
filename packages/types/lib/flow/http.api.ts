import type { ApiError, Endpoint } from '../api';
import type { ScriptTypeLiteral } from '../nangoYaml';

export type PutUpgradePreBuiltFlow = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/flow/pre-built/upgrade';
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

export type PostPreBuiltDeploy = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/flow/pre-built/deploy';
    Body: {
        provider: string;
        providerConfigKey: string;
        scriptName: string;
        type: ScriptTypeLiteral;
    };
    Error: ApiError<'unknown_provider'> | ApiError<'failed_to_deploy', Error[]> | ApiError<'unknown_flow'>;
    Success: {
        data: {
            id: number;
        };
    };
}>;
