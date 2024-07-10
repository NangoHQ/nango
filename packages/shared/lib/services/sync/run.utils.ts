import featureFlags from '../../utils/featureflags.js';

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}

export async function getRunnerFlags(): Promise<RunnerFlags> {
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
