import type { FeatureFlags } from '@nangohq/shared';
import type { RunnerFlags } from '@nangohq/types';

export async function getRunnerFlags(featureFlags: FeatureFlags): Promise<RunnerFlags> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        featureFlags.isEnabled('runner.validateActionInput', 'global', false),
        featureFlags.isEnabled('runner.validateActionOutput', 'global', false),
        featureFlags.isEnabled('runner.validateSyncRecords', 'global', false),
        featureFlags.isEnabled('runner.validateSyncMetadata', 'global', false)
    ]);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
