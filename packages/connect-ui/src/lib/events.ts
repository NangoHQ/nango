import type { AuthResult, ConnectUIEventClose, ConnectUIEventConnect } from '@nangohq/frontend';

export function triggerClose() {
    const event: ConnectUIEventClose = { type: 'close' };
    parent.postMessage(event, '*');
}

export function triggerConnection(results: AuthResult) {
    const event: ConnectUIEventConnect = { type: 'connect', payload: results };
    parent.postMessage(event, '*');
}
