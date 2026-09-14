import { describe, expect, it } from 'vitest';

import { DEFAULT_S3_BUCKET, DEFAULT_S3_REGION, resolveObjectStoreConfig } from './resolve.js';

describe(resolveObjectStoreConfig, () => {
    it('defaults to S3 when nothing is configured', () => {
        expect(resolveObjectStoreConfig({})).toEqual({
            provider: 's3',
            bucket: DEFAULT_S3_BUCKET,
            region: DEFAULT_S3_REGION
        });
    });

    it('resolves S3 from dedicated integrations env vars', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_INTEGRATIONS_REGION: 'eu-west-1',
                AWS_INTEGRATIONS_BUCKET_NAME: 'integrations',
                AWS_INTEGRATIONS_ACCESS_KEY_ID: 'id',
                AWS_INTEGRATIONS_SECRET_ACCESS_KEY: 'secret'
            })
        ).toEqual({
            provider: 's3',
            bucket: 'integrations',
            region: 'eu-west-1',
            credentials: { accessKeyId: 'id', secretAccessKey: 'secret' }
        });
    });

    it('resolves S3 from generic AWS env vars', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_REGION: 'us-east-1',
                AWS_BUCKET_NAME: 'generic',
                AWS_ACCESS_KEY_ID: 'id',
                AWS_SECRET_ACCESS_KEY: 'secret'
            })
        ).toEqual({
            provider: 's3',
            bucket: 'generic',
            region: 'us-east-1',
            credentials: { accessKeyId: 'id', secretAccessKey: 'secret' }
        });
    });

    it('uses a complete dedicated credential pair over a complete generic pair', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_INTEGRATIONS_REGION: 'eu-west-1',
                AWS_INTEGRATIONS_BUCKET_NAME: 'integrations',
                AWS_INTEGRATIONS_ACCESS_KEY_ID: 'dedicated-id',
                AWS_INTEGRATIONS_SECRET_ACCESS_KEY: 'dedicated-secret',
                AWS_ACCESS_KEY_ID: 'generic-id',
                AWS_SECRET_ACCESS_KEY: 'generic-secret'
            }).credentials
        ).toEqual({ accessKeyId: 'dedicated-id', secretAccessKey: 'dedicated-secret' });
    });

    it('does not mix a partial dedicated credential with a generic one', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_INTEGRATIONS_REGION: 'eu-west-1',
                AWS_INTEGRATIONS_BUCKET_NAME: 'integrations',
                AWS_INTEGRATIONS_ACCESS_KEY_ID: 'dedicated-id',
                AWS_ACCESS_KEY_ID: 'generic-id',
                AWS_SECRET_ACCESS_KEY: 'generic-secret'
            }).credentials
        ).toEqual({ accessKeyId: 'generic-id', secretAccessKey: 'generic-secret' });
    });

    it('omits credentials when neither pair is complete', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_INTEGRATIONS_REGION: 'eu-west-1',
                AWS_INTEGRATIONS_BUCKET_NAME: 'integrations',
                AWS_INTEGRATIONS_ACCESS_KEY_ID: 'dedicated-id',
                AWS_SECRET_ACCESS_KEY: 'generic-secret'
            }).credentials
        ).toBeUndefined();
    });

    it('prefers dedicated S3 integrations env vars over generic AWS ones', () => {
        expect(
            resolveObjectStoreConfig({
                AWS_INTEGRATIONS_REGION: 'eu-west-1',
                AWS_INTEGRATIONS_BUCKET_NAME: 'integrations',
                AWS_REGION: 'us-east-1',
                AWS_BUCKET_NAME: 'generic'
            })
        ).toEqual({
            provider: 's3',
            bucket: 'integrations',
            region: 'eu-west-1'
        });
    });

    it('resolves GCS', () => {
        expect(resolveObjectStoreConfig({ GCS_INTEGRATIONS_BUCKET_NAME: 'gcs-bucket' })).toEqual({
            provider: 'gcs',
            bucket: 'gcs-bucket'
        });
    });

    it('resolves Azure with an optional account key', () => {
        expect(
            resolveObjectStoreConfig({
                AZURE_INTEGRATIONS_ACCOUNT_NAME: 'acct',
                AZURE_INTEGRATIONS_CONTAINER_NAME: 'container',
                AZURE_INTEGRATIONS_ACCOUNT_KEY: 'key'
            })
        ).toEqual({
            provider: 'azure',
            accountName: 'acct',
            containerName: 'container',
            accountKey: 'key'
        });
    });

    it('resolves Azure without an account key', () => {
        expect(
            resolveObjectStoreConfig({
                AZURE_INTEGRATIONS_ACCOUNT_NAME: 'acct',
                AZURE_INTEGRATIONS_CONTAINER_NAME: 'container'
            })
        ).toEqual({
            provider: 'azure',
            accountName: 'acct',
            containerName: 'container'
        });
    });

    it('throws when Azure account and container are only partially set', () => {
        expect(() => resolveObjectStoreConfig({ AZURE_INTEGRATIONS_ACCOUNT_NAME: 'acct' })).toThrow(
            /AZURE_INTEGRATIONS_ACCOUNT_NAME and AZURE_INTEGRATIONS_CONTAINER_NAME must both be set/
        );
        expect(() => resolveObjectStoreConfig({ AZURE_INTEGRATIONS_CONTAINER_NAME: 'container' })).toThrow(
            /AZURE_INTEGRATIONS_ACCOUNT_NAME and AZURE_INTEGRATIONS_CONTAINER_NAME must both be set/
        );
    });

    it('throws when more than one provider is configured', () => {
        expect(() =>
            resolveObjectStoreConfig({
                AWS_REGION: 'us-west-2',
                AWS_BUCKET_NAME: 's3-bucket',
                GCS_INTEGRATIONS_BUCKET_NAME: 'gcs-bucket'
            })
        ).toThrow(/mutually exclusive/);

        expect(() =>
            resolveObjectStoreConfig({
                GCS_INTEGRATIONS_BUCKET_NAME: 'gcs-bucket',
                AZURE_INTEGRATIONS_ACCOUNT_NAME: 'acct',
                AZURE_INTEGRATIONS_CONTAINER_NAME: 'container'
            })
        ).toThrow(/mutually exclusive/);

        expect(() =>
            resolveObjectStoreConfig({
                AWS_REGION: 'us-west-2',
                AWS_BUCKET_NAME: 's3-bucket',
                AZURE_INTEGRATIONS_ACCOUNT_NAME: 'acct',
                AZURE_INTEGRATIONS_CONTAINER_NAME: 'container'
            })
        ).toThrow(/mutually exclusive/);
    });
});
