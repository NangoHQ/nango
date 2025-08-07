import type { Event } from '../event.js';
import type { Result } from '@nangohq/utils';

// TODO: add support for subscriber ack/nack

export interface SubscribeProps<TSubject extends Event['subject'] = Event['subject']> {
    consumerGroup: string;
    subject: TSubject;
    callback: (event: Extract<Event, { subject: TSubject }>) => Promise<void> | void;
}

export interface Transport {
    publish(event: Event): Promise<Result<void>>;
    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void;
    connect(props?: { timeoutMs: number }): Promise<Result<void>>;
    disconnect(): Promise<Result<void>>;
}
