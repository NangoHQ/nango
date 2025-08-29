import { useGlobal } from './store';
import { telemetry } from './telemetry';

import type { AuthResult, ConnectUIEventClose, ConnectUIEventConnect, ConnectUIEventReady } from '@nangohq/frontend';
import type { PostPublicConnectTelemetry } from '@nangohq/types';

export function triggerReady() {
    const event: ConnectUIEventReady = { type: 'ready' };
    parent.postMessage(event, '*');
}

export function triggerClose(eventName: PostPublicConnectTelemetry['Body']['event']) {
    const { isPreview, isDirty, nango } = useGlobal.getState();
    if (isPreview) {
        return;
    }

    if (isDirty) {
        const leave = confirm('Are you sure you want to leave?');
        if (!leave) {
            return;
        }
    }

    telemetry(eventName);
    const event: ConnectUIEventClose = { type: 'close' };
    parent.postMessage(event, '*');
    nango?.clear();
}

export function triggerConnection(results: AuthResult) {
    const event: ConnectUIEventConnect = { type: 'connect', payload: results };
    parent.postMessage(event, '*');
}
