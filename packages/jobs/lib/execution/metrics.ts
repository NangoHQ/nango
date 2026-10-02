import { metrics } from '@nangohq/utils';

import type { FunctionRuntime, UsageFunctionExecutionsEvent } from '@nangohq/types';

type FunctionType = UsageFunctionExecutionsEvent['payload']['properties']['type'];

export function recordFunctionExecution({
    accountId,
    type,
    success,
    durationMs,
    runtime
}: {
    accountId: number;
    type: FunctionType;
    success: boolean;
    durationMs: number;
    runtime: FunctionRuntime | undefined;
}): void {
    metrics.duration(metrics.Types.FUNCTION_DURATION_MS, Math.max(0, durationMs), {
        accountId,
        type,
        success: String(success),
        ...(runtime ? { functionRuntime: runtime } : {})
    });
}
