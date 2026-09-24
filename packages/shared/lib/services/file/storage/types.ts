import type { Readable } from 'node:stream';

export interface ObjectStore {
    put(key: string, content: string): Promise<void>;
    get(key: string): Promise<string>;
    getStream(key: string): Promise<Readable | null>;
    copy(sourceKey: string, destinationKey: string): Promise<void>;
    delete(keys: string[]): Promise<void>;
    hasSameContent(key: string, content: string): Promise<boolean>;
}
