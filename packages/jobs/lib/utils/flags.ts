import { getFeatureFlagsClient } from '@nangohq/kvstore';
import type { RunnerFlags } from '@nangohq/types';

export const ffClient = await getFeatureFlagsClient();
export async function getRunnerFlags(): Promise<RunnerFlags> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        ffClient.isSet({ key: 'runner.validateActionInput' }),
        ffClient.isSet({ key: 'runner.validateActionOutput' }),
        ffClient.isSet({ key: 'runner.validateSyncRecords' }),
        ffClient.isSet({ key: 'runner.validateSyncMetadata' })
    ]);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
