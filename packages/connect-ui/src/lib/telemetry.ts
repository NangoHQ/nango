import type { PostPublicConnectTelemetry } from '@nangohq/types';

import { useGlobal } from './store';

export function telemetry(event: PostPublicConnectTelemetry['Body']['event'], dimensions?: PostPublicConnectTelemetry['Body']['dimensions']) {
    const state = useGlobal.getState();
    if (!state.sessionToken) {
        return;
    }
    const headers = {
        type: 'application/json'
    };
    const blob = new Blob(
        [JSON.stringify({ event, dimensions, token: state.sessionToken, timestamp: new Date() } satisfies PostPublicConnectTelemetry['Body'])],
        headers
    );
    navigator.sendBeacon(new URL(`${state.apiURL}/connect/telemetry`), blob);
}
