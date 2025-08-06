import { Ok } from '@nangohq/utils';

import { ActiveMQ } from './activemq.js';
import { NoOpTransport } from './noop.js';
import { envs } from '../env.js';

import type { Transport } from './transport.js';
import type { Result } from '@nangohq/utils';

export class DefaultTransport implements Transport {
    private transport: Transport;
    private isConnected = false;

    constructor() {
        if (envs.NANGO_PUBSUB_TRANSPORT === 'activemq') {
            this.transport = new ActiveMQ();
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

    async publish(event: any): Promise<Result<void>> {
        return this.transport.publish(event);
    }

    subscribe(subscription: any): void {
        return this.transport.subscribe(subscription);
    }
}
