import type { DBPlan, RunnerFlags } from '@nangohq/types';

export function getRunnerFlags(plan: DBPlan | null): RunnerFlags {
    return {
        validateActionInput: false,
        validateActionOutput: false,
        validateSyncRecords: false,
        validateSyncMetadata: false,
        exportRunnerTelemetry: plan?.export_runner_telemetry ?? false
    };
}
