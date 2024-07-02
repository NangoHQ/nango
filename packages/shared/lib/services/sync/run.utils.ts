import featureFlags from '../../utils/featureflags.js';

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}

export async function getRunnerFlags(): Promise<RunnerFlags> {
    const validateActionInput = await featureFlags.isEnabled('runner.validateActionInput', 'global', true);
    const validateActionOutput = await featureFlags.isEnabled('runner.validateActionOutput', 'global', true);
    const validateSyncRecords = await featureFlags.isEnabled('runner.validateSyncRecords', 'global', true);
    const validateSyncMetadata = await featureFlags.isEnabled('runner.validateSyncMetadata', 'global', true);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
