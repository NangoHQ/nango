import type { AuthResult, ConnectUIEventClose, ConnectUIEventConnect, ConnectUIEventReady } from '@nangohq/frontend';

import { useGlobal } from './store';

export function triggerReady() {
    const event: ConnectUIEventReady = { type: 'ready' };
    parent.postMessage(event, '*');
}

export function triggerClose() {
    const isDirty = useGlobal.getState().isDirty;
    const nango = useGlobal.getState().nango;
    if (isDirty) {
        const leave = confirm('Are you sure you want to leave?');
        if (!leave) {
            return;
        }
    }

    const event: ConnectUIEventClose = { type: 'close' };
    parent.postMessage(event, '*');
    nango?.clear();
}

export function triggerConnection(results: AuthResult) {
    const event: ConnectUIEventConnect = { type: 'connect', payload: results };
    parent.postMessage(event, '*');
}
