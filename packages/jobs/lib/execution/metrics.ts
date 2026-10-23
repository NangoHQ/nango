import { metrics } from '@nangohq/utils';

import type { FunctionExecutionOutcome, FunctionRuntime, UsageFunctionExecutionsEvent } from '@nangohq/types';

type FunctionType = UsageFunctionExecutionsEvent['payload']['properties']['type'];

export function recordFunctionExecution({
    accountId,
    type,
    success,
    durationMs,
    runtime,
    outcome
}: {
    accountId: number;
    type: FunctionType;
    success: boolean;
    durationMs: number;
    runtime: FunctionRuntime | undefined;
    outcome?: FunctionExecutionOutcome | undefined;
}): void {
    metrics.duration(metrics.Types.FUNCTION_DURATION_MS, Math.max(0, durationMs), {
        accountId,
        type,
        success: String(success),
        ...(runtime ? { functionRuntime: runtime } : {}),
        ...(outcome ? { outcome } : {})
    });
}
