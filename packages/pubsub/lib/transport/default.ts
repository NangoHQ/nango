import { Ok } from '@nangohq/utils';

import { ActiveMQ } from './activemq.js';
import { Migration } from './migration.js';
import { NoOpTransport } from './noop.js';
import { SnsSqs } from './sns-sqs.js';
import { envs } from '../env.js';

import type { SubscribeProps, Transport } from './transport.js';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class DefaultTransport implements Transport {
    private transport: Transport;
    private isConnected = false;

    constructor() {
        if (envs.NANGO_PUBSUB_TRANSPORT === 'activemq') {
            this.transport = new ActiveMQ();
        } else if (envs.NANGO_PUBSUB_TRANSPORT === 'sns-sqs') {
            const cfg = envs.NANGO_PUBSUB_SNS_SQS_CONFIG;
            this.transport = new SnsSqs({
                topicArns: cfg.topicArns,
                queueUrls: cfg.queueUrls
            });
        } else if (envs.NANGO_PUBSUB_TRANSPORT === 'migration') {
            const cfg = envs.NANGO_PUBSUB_SNS_SQS_CONFIG;
            this.transport = new Migration(new ActiveMQ(), [
                new ActiveMQ(),
                new SnsSqs({
                    topicArns: cfg.topicArns,
                    queueUrls: cfg.queueUrls
                })
            ]);
        } else {
            this.transport = new NoOpTransport();
        }
    }

    async connect(): Promise<Result<void>> {
        if (this.isConnected) {
            return Ok(undefined);
        }
        const res = await this.transport.connect();
        if (res.isErr()) {
            return res;
        }
        this.isConnected = true;
        return Ok(undefined);
    }

    async disconnect(): Promise<Result<void>> {
        const res = await this.transport.disconnect();
        if (res.isErr()) {
            return res;
        }
        this.isConnected = false;
        return Ok(undefined);
    }

    async publish(event: Event): Promise<Result<void>> {
        return this.transport.publish(event);
    }

    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void {
        return this.transport.subscribe(params);
    }
}
