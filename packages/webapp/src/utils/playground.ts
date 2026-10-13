import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { trackPlaygroundOpened } from '@/features/Playground/analytics';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';

import type { PlaygroundOpenSource } from '@/features/Playground/analytics';
import type { PlaygroundFunctionType, PlaygroundState } from '@/store/playground';

export interface PlaygroundContextOverride {
    source: Exclude<PlaygroundOpenSource, 'playground'>;
    integration?: string | null;
    connection?: string | null;
    functionName?: string | null;
    functionType?: PlaygroundFunctionType;
    inputValues?: Record<string, string>;
}

export interface PlaygroundLocationState {
    back?: { to: string; label: string };
}

export function useOpenPlaygroundWithContext() {
    const env = useStore((s) => s.env);
    const navigate = useNavigate();
    const location = useLocation();

    return useCallback(
        (override: PlaygroundContextOverride) => {
            const next: PlaygroundState = {
                integration: override.integration ?? null,
                connection: override.connection ?? null,
                function: override.functionName ?? null,
                functionType: override.functionType ?? null,
                inputValues: override.inputValues ?? {},
                result: null,
                pendingOperationId: null,
                running: false,
                inputErrors: {},
                connectionSearch: ''
            };

            usePlaygroundStore.getState().setState(next);
            trackPlaygroundOpened(override.source);

            const state: PlaygroundLocationState = { back: { to: location.pathname + location.search, label: override.source } };
            void navigate(`/${env}/playground/functions`, { state });
        },
        [env, navigate, location.pathname, location.search]
    );
}
