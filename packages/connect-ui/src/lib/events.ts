import type { AuthResult, ConnectUIEventClose, ConnectUIEventConnect } from '@nangohq/frontend';

import { useGlobal } from './store';

export function triggerClose() {
    const isDirty = useGlobal.getState().isDirty;
    if (isDirty) {
        const leave = confirm('Are you sure you want to leave?');
        if (!leave) {
            return;
        }
    }

    const event: ConnectUIEventClose = { type: 'close' };
    parent.postMessage(event, '*');
}

export function triggerConnection(results: AuthResult) {
    const event: ConnectUIEventConnect = { type: 'connect', payload: results };
    parent.postMessage(event, '*');
}
