import { FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON } from '@/components/patterns/PermissionGate';

import type { ApiKeyCredentials } from '@nangohq/types';

export const ApiKeyCredentialsComponent: React.FC<{
    credentials: ApiKeyCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="api_key">API key</FieldLabel>
                <SecretInput id="api_key" value={credentials.apiKey} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>
        </>
    );
};
