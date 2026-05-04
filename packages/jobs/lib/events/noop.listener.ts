import type { EventListener, QueueMessage } from './listener.js';

export class NoopEventListener implements EventListener {
    listen(_queue: string, _onMessage?: (message: QueueMessage) => Promise<void>): Promise<void> {
        return Promise.resolve();
    }

    stop(): Promise<void> {
        return Promise.resolve();
    }
}
