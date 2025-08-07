import { setTimeout } from 'node:timers/promises';

import { Client } from '@stomp/stompjs';
import WebSocket from 'ws';

import { Err, Ok, getLogger, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { serde } from '../utils/serde.js';

import type { SubscribeProps, Transport } from './transport.js';
import type { Event } from '../event.js';
import type { Result } from '@nangohq/utils';
import type { StompConfig, StompSubscription } from '@stomp/stompjs';

const logger = getLogger('pubsub.activemq');

export class ActiveMQ implements Transport {
    private client: Client | null = null;
    private isConnected = false;
    private messageEncoding: BufferEncoding = 'binary';
    private activeSubscriptions = new Map<StompSubscription, SubscribeProps<any>>();

    constructor(props?: { url: string; user: string; password: string }) {
        const brokerUrl = props?.url ?? envs.NANGO_ACTIVEMQ_URL;
        const brokerUrls = brokerUrl.split(',').map((url) => url.trim());
        let currentUrlIndex = 0;
        const stompConfig: StompConfig = {
            beforeConnect: () => {
                // Rotate through broker URLs if the current one fails
                currentUrlIndex = (currentUrlIndex + 1) % brokerUrls.length;
            },
            webSocketFactory: () => {
                const brokerUrl = brokerUrls[currentUrlIndex];
                if (!brokerUrl) {
                    throw new Error('No valid ActiveMQ broker URL available');
                }
                return new WebSocket(brokerUrl, ['stomp']);
            },
            connectHeaders: {
                login: props?.user ?? envs.NANGO_ACTIVEMQ_USER,
                passcode: props?.password ?? envs.NANGO_ACTIVEMQ_PASSWORD
            },
            heartbeatIncoming: 10_000,
            heartbeatOutgoing: 10_000,
            reconnectDelay: 1_000,
            onConnect: () => {
                this.isConnected = true;
                logger.info(`ActiveMQ: connected to ${brokerUrls[currentUrlIndex]}`);
                // subscriptions don't persist across reconnects, so we need to resubscribe
                const copy = new Map(this.activeSubscriptions);
                this.unsubscribeAll();
                for (const [_, subscribeProps] of copy) {
                    this.subscribe(subscribeProps);
                }
            },
            onDisconnect: () => {
                this.isConnected = false;
                logger.warning(`ActiveMQ: disconnected from ${brokerUrls[currentUrlIndex]}`);
            },
            onStompError: (frame) => {
                report(new Error(`ActiveMQ STOMP error`), { error: frame.body });
            },
            onWebSocketError: (error) => {
                report(new Error(`ActiveMQ WebSocket error`), { error });
            }
        };

        this.client = new Client(stompConfig);
    }

    public async connect(props?: { timeoutMs: number }): Promise<Result<void>> {
        if (!this.client) {
            return Err(new Error('ActiveMQ client is not initialized'));
        }
        if (this.isConnected) {
            return Ok(undefined);
        }

        try {
            this.client.activate();

            const timeoutMs = props?.timeoutMs ?? envs.NANGO_ACTIVEMQ_CONNECT_TIMEOUT_MS;
            const start = Date.now();
            while (!this.isConnected && Date.now() - start < timeoutMs) {
                await setTimeout(100);
            }

            if (!this.isConnected) {
                return Err(`Failed to connect to ActiveMQ within ${timeoutMs}ms`);
            }

            return Ok(undefined);
        } catch (err) {
            report(new Error('Error connecting to ActiveMQ'), { error: err });
            return Err(new Error('Failed to connect to ActiveMQ', { cause: err }));
        }
    }

    public unsubscribeAll(): void {
        for (const [sub] of this.activeSubscriptions) {
            sub.unsubscribe();
        }
        this.activeSubscriptions.clear();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        if (this.client && this.isConnected) {
            try {
                this.isConnected = false;
                this.client.deactivate();
                return Ok(undefined);
            } catch (err) {
                report(new Error('Error disconnecting from ActiveMQ'), { error: err });
                return Err(new Error('Failed to disconnect from ActiveMQ', { cause: err }));
            }
        }
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publish(event: Event): Promise<Result<void>> {
        if (!this.client || !this.isConnected) {
            return Err('ActiveMQ publisher not available');
        }

        try {
            const encoded = serde.serialize(event);
            if (encoded.isErr()) {
                return Err(new Error(`Failed to encode event: ${encoded.error}`));
            }
            // ActiveMQ supports virtual topics, which allows messages to be sent to multiple consumer groups
            // https://activemq.apache.org/components/classic/documentation/virtual-destinations
            // Consumers can subscribe to corresponding queues. ie: Consumer.${group}.VirtualTopic.${topic}
            this.client.publish({
                destination: `/topic/VirtualTopic.${event.subject}`,
                body: encoded.value.toString(this.messageEncoding),
                headers: {
                    'content-type': 'application/json'
                }
            });

            return Ok(undefined);
        } catch (err) {
            return Err(new Error(`Failed to publish message to ActiveMQ topic ${event.subject}`, { cause: err }));
        }
    }

    subscribe<TSubject extends Event['subject']>(props: SubscribeProps<TSubject>): void {
        const { consumerGroup, subject, callback } = props;
        if (!this.client || !this.isConnected) {
            report(new Error('ActiveMQ consumer not connected, cannot subscribe to events'), { consumerGroup });
            return;
        }

        // ActiveMQ supports virtual topics, which allows messages to be sent to multiple consumer groups
        // https://activemq.apache.org/components/classic/documentation/virtual-destinations
        // Consumers can subscribe to corresponding queues. ie: Consumer.${group}.VirtualTopic.${topic}
        const sub = this.client.subscribe(`/queue/Consumer.${consumerGroup}.VirtualTopic.${subject}`, async (message) => {
            if (message.body) {
                const decoded = serde.deserialize<Extract<Event, { subject: TSubject }>>(Buffer.from(message.body, this.messageEncoding));
                if (decoded.isErr()) {
                    report(new Error(`Failed to deserialize message`), { subject: subject, error: decoded.error });
                    return;
                }
                await Promise.resolve(callback(decoded.value));
            }
        });
        this.activeSubscriptions.set(sub, props);
    }
}
