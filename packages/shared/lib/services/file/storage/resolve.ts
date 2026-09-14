export const DEFAULT_S3_BUCKET = 'nangodev-customer-integrations';
export const DEFAULT_S3_REGION = 'us-west-2';

export type ObjectStoreEnvs = {
    AWS_INTEGRATIONS_ACCESS_KEY_ID?: string | undefined;
    AWS_INTEGRATIONS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_INTEGRATIONS_REGION?: string | undefined;
    AWS_INTEGRATIONS_BUCKET_NAME?: string | undefined;
    AWS_ACCESS_KEY_ID?: string | undefined;
    AWS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_REGION?: string | undefined;
    AWS_BUCKET_NAME?: string | undefined;
    GCS_INTEGRATIONS_BUCKET_NAME?: string | undefined;
    AZURE_INTEGRATIONS_ACCOUNT_NAME?: string | undefined;
    AZURE_INTEGRATIONS_CONTAINER_NAME?: string | undefined;
    AZURE_INTEGRATIONS_ACCOUNT_KEY?: string | undefined;
};

export type S3ObjectStoreConfig = {
    provider: 's3';
    bucket: string;
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
};

export type GcsObjectStoreConfig = {
    provider: 'gcs';
    bucket: string;
};

export type AzureObjectStoreConfig = {
    provider: 'azure';
    accountName: string;
    containerName: string;
    accountKey?: string;
};

export type ObjectStoreConfig = S3ObjectStoreConfig | GcsObjectStoreConfig | AzureObjectStoreConfig;

const EXCLUSIVE_ERROR = 'S3, GCS, and Azure integration storage are mutually exclusive: set only one';
const AZURE_PAIR_ERROR = 'AZURE_INTEGRATIONS_ACCOUNT_NAME and AZURE_INTEGRATIONS_CONTAINER_NAME must both be set';

type EnvSource = Record<string, string | undefined>;

export function isS3Configured(envs: EnvSource): boolean {
    return Boolean((envs['AWS_INTEGRATIONS_REGION'] && envs['AWS_INTEGRATIONS_BUCKET_NAME']) || (envs['AWS_REGION'] && envs['AWS_BUCKET_NAME']));
}

export function isGcsConfigured(envs: EnvSource): boolean {
    return Boolean(envs['GCS_INTEGRATIONS_BUCKET_NAME']);
}

export function isAzureConfigured(envs: EnvSource): boolean {
    return Boolean(envs['AZURE_INTEGRATIONS_ACCOUNT_NAME'] && envs['AZURE_INTEGRATIONS_CONTAINER_NAME']);
}

function getS3Credentials(envs: EnvSource): S3ObjectStoreConfig['credentials'] {
    const accessKeyId = envs['AWS_INTEGRATIONS_ACCESS_KEY_ID'] || envs['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = envs['AWS_INTEGRATIONS_SECRET_ACCESS_KEY'] || envs['AWS_SECRET_ACCESS_KEY'];
    if (!accessKeyId || !secretAccessKey) {
        return undefined;
    }
    return { accessKeyId, secretAccessKey };
}

function s3Config(envs: EnvSource): S3ObjectStoreConfig {
    const credentials = getS3Credentials(envs);
    return {
        provider: 's3',
        bucket: envs['AWS_INTEGRATIONS_BUCKET_NAME'] || envs['AWS_BUCKET_NAME'] || DEFAULT_S3_BUCKET,
        region: envs['AWS_INTEGRATIONS_REGION'] || envs['AWS_REGION'] || DEFAULT_S3_REGION,
        ...(credentials ? { credentials } : {})
    };
}

/**
 * Exactly one remote backend. Defaults to S3 (including the historical bucket/region
 * fallbacks) when nothing is configured, so public-template fetches keep working locally.
 */
export function resolveObjectStoreConfig(envs: EnvSource): ObjectStoreConfig {
    const hasAzureAccount = Boolean(envs['AZURE_INTEGRATIONS_ACCOUNT_NAME']);
    const hasAzureContainer = Boolean(envs['AZURE_INTEGRATIONS_CONTAINER_NAME']);
    if (hasAzureAccount !== hasAzureContainer) {
        throw new Error(AZURE_PAIR_ERROR);
    }

    const configured: Array<'s3' | 'gcs' | 'azure'> = [];
    if (isS3Configured(envs)) {
        configured.push('s3');
    }
    if (isGcsConfigured(envs)) {
        configured.push('gcs');
    }
    if (isAzureConfigured(envs)) {
        configured.push('azure');
    }

    if (configured.length > 1) {
        throw new Error(EXCLUSIVE_ERROR);
    }

    const gcsBucket = envs['GCS_INTEGRATIONS_BUCKET_NAME'];
    if (configured[0] === 'gcs' && gcsBucket) {
        return { provider: 'gcs', bucket: gcsBucket };
    }

    const azureAccount = envs['AZURE_INTEGRATIONS_ACCOUNT_NAME'];
    const azureContainer = envs['AZURE_INTEGRATIONS_CONTAINER_NAME'];
    if (configured[0] === 'azure' && azureAccount && azureContainer) {
        const accountKey = envs['AZURE_INTEGRATIONS_ACCOUNT_KEY'];
        return {
            provider: 'azure',
            accountName: azureAccount,
            containerName: azureContainer,
            ...(accountKey ? { accountKey } : {})
        };
    }

    return s3Config(envs);
}
