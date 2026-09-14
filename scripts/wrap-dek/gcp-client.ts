import { KeyManagementServiceClient } from '@google-cloud/kms';
import { GoogleAuth, Impersonated } from 'google-auth-library';

import type { GcpKmsClient } from './gcp.js';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * ADC when GOOGLE_IMPERSONATE_SERVICE_ACCOUNT is unset.
 * Otherwise impersonates that SA on first encrypt/decrypt (constructor stays sync).
 */
export function defaultGcpKmsClient(): GcpKmsClient {
    const targetPrincipal = process.env['GOOGLE_IMPERSONATE_SERVICE_ACCOUNT']?.trim();
    if (!targetPrincipal) {
        return new KeyManagementServiceClient();
    }
    return lazyImpersonatedKmsClient(targetPrincipal);
}

function lazyImpersonatedKmsClient(targetPrincipal: string): GcpKmsClient {
    let clientPromise: Promise<KeyManagementServiceClient> | undefined;
    const getClient = () => {
        clientPromise ??= createImpersonatedKmsClient(targetPrincipal);
        return clientPromise;
    };
    return {
        async encrypt(request) {
            return (await getClient()).encrypt(request);
        },
        async decrypt(request) {
            return (await getClient()).decrypt(request);
        }
    };
}

async function createImpersonatedKmsClient(targetPrincipal: string): Promise<KeyManagementServiceClient> {
    const sourceClient = await new GoogleAuth({ scopes: CLOUD_PLATFORM_SCOPE }).getClient();
    const authClient = new Impersonated({
        sourceClient,
        targetPrincipal,
        targetScopes: [CLOUD_PLATFORM_SCOPE]
    });
    // Pass `auth` (a GoogleAuth instance). `{ authClient }` is GoogleAuthOptions
    // and is easy for google-gax to ignore when it constructs its own GoogleAuth.
    const auth = new GoogleAuth({ authClient });
    console.error(`Impersonating ${targetPrincipal}`);
    return new KeyManagementServiceClient({ auth });
}
