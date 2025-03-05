import { getFeatureFlagsClient } from '@nangohq/kvstore';
import type { RunnerFlags } from '@nangohq/types';

export const ffClient = await getFeatureFlagsClient();
export async function getRunnerFlags(): Promise<RunnerFlags> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        ffClient.isSet('runner.validateActionInput'),
        ffClient.isSet('runner.validateActionOutput'),
        ffClient.isSet('runner.validateSyncRecords'),
        ffClient.isSet('runner.validateSyncMetadata')
    ]);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
