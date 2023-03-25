import { createClient } from 'redis';
import { useInMemorySession } from '../utils/utils.js';
import logger from '../utils/logger.js';

class InmemoryDb {
    // @ts-ignore
    private redisClient;
    private useInMemorySession = false;
    private inMemorySession: Map<string, any> = new Map<string, any>();

    constructor() {

    }

    async start() {
        this.useInMemorySession = useInMemorySession();
        console.log(useInMemorySession(), 'use in memory');
        if (!this.useInMemorySession) {
            logger.info('Connecting to redis DB a connection string exist');
            const connectionUrl = process.env['REDIS_CONNECTION_URL'] as string;
            try {
                this.redisClient = createClient({
                    url: connectionUrl
                });
                await this.redisClient.connect();
            } catch (e) {
                logger.error('Error connecting to redis instance');
                throw e;
            }

        }
    }

    async set(key: string, value: Record<any, any>) {
        if (this.useInMemorySession) {
            this.inMemorySession.set(key, value);
        } else {
            await this.redisClient!.set(key, JSON.stringify(value));
        }
    }

    async get(key: string): Promise<Record<any, any> | null> {
        if (this.useInMemorySession) {
            return this.inMemorySession.get(key) as Record<any, any>;
        } else {
            let value = await this.redisClient!.get(key);
            if (value) {
                return JSON.parse(value) as Record<any, any>;
            }
            return null;
        }
    }

    async delete(value: string) {
        if (this.useInMemorySession) {
            this.inMemorySession.delete(value);
        } else {
            await this.redisClient.del(value);
        }
    }


}

export default new InmemoryDb();
