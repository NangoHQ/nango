import type { Result } from '@nangohq/utils';
import type { Event } from '../event.js';

export interface Subscription {
    subject: Event['subject'];
    callback: (event: Event) => void;
}

export interface Transport {
    publish(event: Event): Promise<Result<void>>;
    subscribe({ consumerGroup, subscriptions }: { consumerGroup: string; subscriptions: Subscription[] }): void;
    connect(props?: { timeoutMs: number }): Promise<Result<void>>;
    disconnect(): Promise<Result<void>>;
}
