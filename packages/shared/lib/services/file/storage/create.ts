import { S3Client } from '@aws-sdk/client-s3';

import { AzureObjectStore } from './azure.js';
import { GcsObjectStore } from './gcs.js';
import { S3ObjectStore } from './s3.js';

import type { ObjectStoreConfig } from './resolve.js';
import type { ObjectStore } from './types.js';

export function createObjectStore(config: ObjectStoreConfig): ObjectStore {
    switch (config.provider) {
        case 's3': {
            const clientConfig = config.credentials ? { region: config.region, credentials: config.credentials } : { region: config.region };
            return new S3ObjectStore(new S3Client(clientConfig), config.bucket);
        }
        case 'gcs':
            return GcsObjectStore.fromBucketName(config.bucket);
        case 'azure':
            return AzureObjectStore.fromConfig(config);
    }
}
