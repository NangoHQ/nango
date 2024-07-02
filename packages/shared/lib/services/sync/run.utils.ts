import featureFlags from '../../utils/featureflags.js';

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}

export async function getRunnerFlags(): Promise<RunnerFlags> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        featureFlags.isEnabled('runner.validateActionInput', 'global', true),
        featureFlags.isEnabled('runner.validateActionOutput', 'global', true),
        featureFlags.isEnabled('runner.validateSyncRecords', 'global', true),
        featureFlags.isEnabled('runner.validateSyncMetadata', 'global', true)
    ]);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
