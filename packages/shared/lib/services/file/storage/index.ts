export { AzureObjectStore } from './azure.js';
export { copyObject } from './copy.js';
export { createObjectStore } from './create.js';
export { GcsObjectStore } from './gcs.js';
export { resolveObjectStoreConfig, resolveTemplatesObjectStoreConfig } from './resolve.js';
export { S3ObjectStore } from './s3.js';
export type { ObjectStore } from './types.js';
export type {
    AzureObjectStoreConfig,
    GcsObjectStoreConfig,
    ObjectStoreConfig,
    ObjectStoreEnvs,
    S3ObjectStoreConfig,
    TemplatesObjectStoreEnvs
} from './resolve.js';
