import type { MaybePromise } from '@nangohq/types';
import type { Redis } from 'ioredis';
import type { RedisClientType } from 'redis';

export type RedisClient = RedisClientType | Redis;

export interface KVStore {
    destroy(): MaybePromise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlInMs?: number }): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlInMs?: number; delta?: number }): MaybePromise<number>;
    scan(pattern: string): AsyncGenerator<string>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, onMessage: (message: string, channel: string) => void): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
}

export interface KVStoreRedis extends KVStore {
    getClient(): RedisClient;
}
