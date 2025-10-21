import { getFeatureFlagsClient } from '@nangohq/kvstore';

export const featureFlags = await getFeatureFlagsClient();
export async function getRunnerFlags(): Promise<{
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        featureFlags.isSet('runner.validateActionInput'),
        featureFlags.isSet('runner.validateActionOutput'),
        featureFlags.isSet('runner.validateSyncRecords'),
        featureFlags.isSet('runner.validateSyncMetadata')
    ]);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
