import { getFeatureFlagsClient } from '@nangohq/kvstore';

import type { DBPlan, RunnerFlags } from '@nangohq/types';

export const featureFlags = await getFeatureFlagsClient();
export async function getRunnerFlags(plan: DBPlan | null): Promise<RunnerFlags> {
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
        validateSyncMetadata,
        exportRunnerTelemetry: plan?.export_runner_telemetry ?? false
    };
}
