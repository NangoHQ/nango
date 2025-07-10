import { setTimeout } from 'node:timers/promises';

import { Client } from '@stomp/stompjs';
import WebSocket from 'ws';

import { Err, Ok, getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { serde } from '../utils/serde.js';

import type { Subscription, Transport } from './transport.js';
import type { Event } from '../event.js';
import type { Result } from '@nangohq/utils';
import type { StompConfig } from '@stomp/stompjs';

const logger = getLogger('pubsub.activemq');

export class ActiveMQ implements Transport {
    private client: Client | null = null;
    private isConnected = false;
    private messageEncoding: BufferEncoding = 'binary';

    constructor(props?: { url: string; user: string; password: string }) {
        const stompConfig: StompConfig = {
            webSocketFactory: () => new WebSocket(props?.url ?? envs.NANGO_ACTIVEMQ_URL, ['stomp']),
            connectHeaders: {
                login: props?.user ?? envs.NANGO_ACTIVEMQ_USER,
                passcode: props?.password ?? envs.NANGO_ACTIVEMQ_PASSWORD
            },
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            reconnectDelay: 5000,
            onConnect: () => {
                this.isConnected = true;
                logger.info('ActiveMQ publisher connected');
            },
            onDisconnect: () => {
                this.isConnected = false;
                logger.warning('ActiveMQ publisher disconnected');
            },
            onStompError: (frame) => {
                this.isConnected = false;
                logger.error('ActiveMQ STOMP error:', frame.body);
            },
            onWebSocketError: (error) => {
                this.isConnected = false;
                logger.error('ActiveMQ WebSocket error:', error);
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
                throw new Error(`Failed to connect to ActiveMQ within ${timeoutMs}ms`);
            }

            return Ok(undefined);
        } catch (err) {
            logger.error('Error connecting to ActiveMQ:', err);
            return Err(new Error('Failed to connect to ActiveMQ', { cause: err }));
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        if (this.client) {
            try {
                this.client.deactivate();
                this.client = null;
                this.isConnected = false;
                logger.info('ActiveMQ publisher disconnected');
                return Ok(undefined);
            } catch (err) {
                logger.error('Error disconnecting from ActiveMQ:', err);
                return Err(new Error('Failed to disconnect from ActiveMQ', { cause: err }));
            }
        }
        return Ok(undefined); // no client to disconnect
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publish(event: Event): Promise<Result<void>> {
        if (!this.client || !this.isConnected) {
            return Err('ActiveMQ publisher not available');
        }

        try {
            const encoded = serde.encode(event);
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

    public subscribe({ consumerGroup, subscriptions }: { consumerGroup: string; subscriptions: Subscription[] }): void {
        if (!this.client || !this.isConnected) {
            logger.error('ActiveMQ publisher not connected, cannot subscribe to events');
            return;
        }

        // ActiveMQ supports virtual topics, which allows messages to be sent to multiple consumer groups
        // https://activemq.apache.org/components/classic/documentation/virtual-destinations
        // Consumers can subscribe to corresponding queues. ie: Consumer.${group}.VirtualTopic.${topic}
        for (const { subject, callback } of subscriptions) {
            this.client.subscribe(`/queue/Consumer.${consumerGroup}.VirtualTopic.${subject}`, (message) => {
                if (message.body) {
                    const decoded = serde.decode<Event>(Buffer.from(message.body, this.messageEncoding));
                    if (decoded.isErr()) {
                        logger.error('Failed to parse message body:', decoded.error);
                        return;
                    }
                    callback(decoded.value);
                }
            });
        }
    }
}
