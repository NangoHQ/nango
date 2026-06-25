import { Label } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { ApiKeyCredentials } from '@nangohq/types';

export const ApiKeyCredentialsComponent: React.FC<{
    credentials: ApiKeyCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="api_key">API key</Label>
                <SecretInput id="api_key" value={credentials.apiKey} disabled copy canRead={canRead} />
            </div>
        </>
    );
};
