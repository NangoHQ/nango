import { Ok, getLogger, report } from '@nangohq/utils';

import type { Subscription, Transport } from './transport.js';
import type { Event } from '../event.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('pubsub.local');

interface LocalSubscription {
    subject: Event['subject'];
    callback: (event: Event) => void;
    consumerGroup: string;
}

/**
 * Local in-memory transport.
 * Events are processed asynchronously, publishing events is non-blocking.
 */
export class LocalTransport implements Transport {
    private subscriptions: LocalSubscription[] = [];
    private isConnected = false;
    private processingQueue: { event: Event; subject: Event['subject'] }[] = [];
    private isProcessing = false;

    // eslint-disable-next-line @typescript-eslint/require-await
    public async connect(): Promise<Result<void>> {
        this.isConnected = true;
        logger.info('Local transport connected');
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        this.isConnected = false;
        this.subscriptions = [];
        this.processingQueue = [];
        this.isProcessing = false;
        logger.info('Local transport disconnected');
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publish(event: Event): Promise<Result<void>> {
        if (!this.isConnected) {
            return Ok(undefined); // Silently succeed when not connected
        }

        try {
            // Add to processing queue and trigger async processing
            this.processingQueue.push({ event, subject: event.subject });
            void this.processQueueAsync();

            return Ok(undefined);
        } catch (err) {
            report(new Error('Error publishing event to local transport'), { error: err, subject: event.subject });
            return Ok(undefined); // Still return success to not block publisher
        }
    }

    public subscribe({ consumerGroup, subscriptions }: { consumerGroup: string; subscriptions: Subscription[] }): void {
        if (!this.isConnected) {
            logger.warning('Local transport not connected, cannot subscribe to events');
            return;
        }

        for (const { subject, callback } of subscriptions) {
            const localSubscription: LocalSubscription = {
                subject,
                callback,
                consumerGroup
            };

            this.subscriptions.push(localSubscription);
            logger.info(`Subscribed to ${subject} for consumer group ${consumerGroup}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    private async processQueueAsync(): Promise<void> {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.processingQueue.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const { event, subject } = this.processingQueue.shift()!;

                // Find all subscriptions for this subject
                const relevantSubscriptions = this.subscriptions.filter((sub) => sub.subject === subject);

                // Process each subscription asynchronously without blocking
                for (const subscription of relevantSubscriptions) {
                    void this.processSubscriptionAsync(subscription, event);
                }
            }
        } catch (err) {
            report(new Error('Error processing local transport queue'), { error: err });
        } finally {
            this.isProcessing = false;

            // Check if more items were added while processing
            if (this.processingQueue.length > 0) {
                // Use setImmediate to avoid blocking the current execution
                setImmediate(() => void this.processQueueAsync());
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    private async processSubscriptionAsync(subscription: LocalSubscription, event: Event): Promise<void> {
        try {
            // Use setImmediate to ensure the callback runs in the next tick
            // This prevents blocking the publisher thread
            setImmediate(() => {
                try {
                    subscription.callback(event);
                } catch (err) {
                    report(new Error('Error in local transport subscription callback'), {
                        error: err,
                        subject: subscription.subject,
                        consumerGroup: subscription.consumerGroup
                    });
                }
            });
        } catch (err) {
            report(new Error('Error scheduling local transport subscription callback'), {
                error: err,
                subject: subscription.subject,
                consumerGroup: subscription.consumerGroup
            });
        }
    }
}
