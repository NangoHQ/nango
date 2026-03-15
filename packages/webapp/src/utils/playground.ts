import { useStore } from '@/store';

import type { PlaygroundFunctionType, PlaygroundState } from '@/store';

export interface PlaygroundContextOverride {
    integration?: string | null;
    connection?: string | null;
    functionName?: string | null;
    functionType?: PlaygroundFunctionType;
    inputValues?: Record<string, string>;
}

/**
 * Opens the Playground and overwrites its selection state.
 *
 * Intended for future contextual "Open Playground" buttons on
 * integration/connection/sync/action pages (header button should not use this).
 */
export function openPlaygroundWithContext(override: PlaygroundContextOverride) {
    const next: PlaygroundState = {
        isOpen: true,
        integration: override.integration ?? null,
        connection: override.connection ?? null,
        function: override.functionName ?? null,
        functionType: override.functionType ?? null,
        inputValues: override.inputValues ?? {}
    };

    useStore.getState().setPlaygroundState(next);
}
