import { trackPlaygroundOpened } from '@/features/Playground/analytics';
import { usePermissions } from '@/hooks/usePermissions';
import { defaultPlaygroundState, usePlaygroundStore } from '@/store/playground';

import type { PlaygroundOpenSource } from '@/features/Playground/analytics';
import type { PlaygroundFunctionType } from '@/store/playground';

export interface PlaygroundContextOverride {
    source: PlaygroundOpenSource;
    integration: string;
    connection?: string | null;
    functionName?: string | null;
    functionType?: PlaygroundFunctionType;
}

export function useCanRunFunctions(): boolean {
    return usePermissions().can('environment:syncs:execute');
}

function isRunInFlightFor(override: PlaygroundContextOverride): boolean {
    const current = usePlaygroundStore.getState();
    return (
        (current.running || current.pendingOperationId != null) &&
        current.integration === override.integration &&
        (!override.connection || override.connection === current.connection) &&
        (!override.functionName || (override.functionName === current.function && override.functionType === current.functionType))
    );
}

export function openPlaygroundWithContext(override: PlaygroundContextOverride) {
    trackPlaygroundOpened(override.source);
    const current = usePlaygroundStore.getState();
    if (isRunInFlightFor(override)) {
        current.setOpen(true);
        return;
    }
    current.abortActiveRun?.();
    current.setState({
        ...defaultPlaygroundState,
        isOpen: true,
        integration: override.integration,
        connection: override.connection ?? null,
        function: override.functionName ?? null,
        functionType: override.functionType ?? null
    });
}
